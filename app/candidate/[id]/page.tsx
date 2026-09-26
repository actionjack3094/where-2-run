import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { DebateHistory, type MatchOutcome, type ProfileMatch } from "@/components/candidate/DebateHistory";
import { EscrowTracker } from "@/components/candidate/EscrowTracker";
import { ProfileHeader } from "@/components/candidate/ProfileHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isUuid } from "@/lib/arena/display";
import { DEFAULT_ELO, parseElo } from "@/lib/arena/elo";
import { loadPublicCandidate } from "@/lib/candidate-profile";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import { formatRecord, recordFromStats } from "@/lib/leaderboard";

type CandidatePageProps = {
  params: Promise<{ id: string }>;
};

type AccountName = {
  full_name: string | null;
  created_at: string | null;
};

type StatsRow = {
  id: string;
  username: string | null;
  elo_rating: number | string | null;
  debates_won: number | null;
  debates_played: number | null;
};

type DebateRow = {
  id: string;
  topic: string;
  election_question_id: string | null;
  winner_id: string | null;
  expires_at: string;
};

type DemographicsRow = {
  username: string | null;
  residency_state: string | null;
  residency_zip: string | null;
};

type LoadedCandidate = {
  name: string;
  demographics: string | null;
  eloRating: number;
  record: string;
  matches: ProfileMatch[];
  error: string | null;
  found: boolean;
};

function outcomeFor(winnerId: string | null, candidateId: string): MatchOutcome {
  if (!winnerId) return "tied";
  return winnerId === candidateId ? "won" : "lost";
}

function formatJoined(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDemographics(
  row: DemographicsRow | null,
  joinedAt: string | null,
) {
  const place = [row?.residency_state, row?.residency_zip].filter(Boolean).join(" · ");
  const joined = formatJoined(joinedAt);
  const since = joined ? `Joined ${joined}` : null;
  const line = [place, since].filter(Boolean).join(" · ");
  return line || null;
}

function isSkippableProfileError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  if (isMissingRelation(error)) return true;
  const message = error.message ?? "";
  return (
    error.code === "42501" ||
    /permission denied/i.test(message) ||
    /row-level security/i.test(message)
  );
}

async function loadAccountName(id: string): Promise<AccountName | null> {
  const supabase = await createServerSupabase();
  const primary = await supabase
    .from("profiles")
    .select("full_name, created_at")
    .eq("id", id)
    .maybeSingle();

  if (primary.data) {
    return primary.data as AccountName;
  }

  if (primary.error && !isSkippableProfileError(primary.error)) {
    return null;
  }

  try {
    const admin = createAdminClient();
    const fallback = await admin
      .from("profiles")
      .select("full_name, created_at")
      .eq("id", id)
      .maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return fallback.data as AccountName;
  } catch (caught) {
    if (caught instanceof Error && /SUPABASE_SERVICE_ROLE_KEY/i.test(caught.message)) {
      return null;
    }
    throw caught;
  }
}

const loadCandidate = cache(async (id: string): Promise<LoadedCandidate> => {
  const empty: LoadedCandidate = {
    name: "Candidate",
    demographics: null,
    eloRating: DEFAULT_ELO,
    record: formatRecord(0, 0),
    matches: [],
    error: null,
    found: false,
  };

  if (!isUuid(id)) return empty;

  const supabase = await createServerSupabase();
  const [account, statsQuery, debatesQuery, demographicsQuery] = await Promise.all([
    loadAccountName(id),
    supabase
      .from("candidate_stats")
      .select("id, username, elo_rating, debates_won, debates_played")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("debates")
      .select("id, topic, election_question_id, winner_id, expires_at")
      .eq("status", "completed")
      .or(`candidate_a_id.eq.${id},candidate_b_id.eq.${id}`)
      .order("expires_at", { ascending: false }),
    supabase
      .from("users")
      .select("username, residency_state, residency_zip")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (statsQuery.error) {
    return { ...empty, error: statsQuery.error.message };
  }
  if (debatesQuery.error) {
    return { ...empty, error: debatesQuery.error.message };
  }
  if (demographicsQuery.error) {
    return { ...empty, error: demographicsQuery.error.message };
  }

  const stats = (statsQuery.data as StatsRow | null) ?? null;
  const demographics = (demographicsQuery.data as DemographicsRow | null) ?? null;
  const debates = (debatesQuery.data ?? []) as DebateRow[];

  if (!stats && !demographics && !account) {
    return empty;
  }

  const questionIds = [
    ...new Set(
      debates
        .map((debate) => debate.election_question_id)
        .filter((questionId): questionId is string => Boolean(questionId)),
    ),
  ];

  const prompts = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: questions, error: questionError } = await supabase
      .from("election_questions")
      .select("id, prompt")
      .in("id", questionIds);

    if (questionError && !isMissingRelation(questionError)) {
      return { ...empty, error: questionError.message };
    }

    for (const question of (questions ?? []) as { id: string; prompt: string }[]) {
      const prompt = question.prompt?.trim();
      if (prompt) prompts.set(question.id, prompt);
    }
  }

  const record = recordFromStats({
    debates_won: stats?.debates_won ?? 0,
    debates_played: stats?.debates_played ?? 0,
  });

  const name =
    account?.full_name?.trim() ||
    stats?.username?.trim() ||
    demographics?.username?.trim() ||
    "Unnamed candidate";

  const matches: ProfileMatch[] = debates.map((debate) => {
    const linkedPrompt = debate.election_question_id
      ? prompts.get(debate.election_question_id)
      : null;
    return {
      id: debate.id,
      question: linkedPrompt || debate.topic.trim() || "Untitled question",
      concludedAt: debate.expires_at,
      outcome: outcomeFor(debate.winner_id, id),
    };
  });

  return {
    name,
    demographics: formatDemographics(demographics, account?.created_at ?? null),
    eloRating: parseElo(stats?.elo_rating) || DEFAULT_ELO,
    record: formatRecord(record.wins, record.losses),
    matches,
    error: null,
    found: true,
  };
});

export async function generateMetadata({
  params,
}: CandidatePageProps): Promise<Metadata> {
  const { id } = await params;
  const candidate = await loadCandidate(id);

  return {
    title: candidate.found
      ? `${candidate.name} · Candidate · WHERE 2 RUN`
      : "Candidate · WHERE 2 RUN",
    description: candidate.found
      ? `ELO, win-loss record, and match history for ${candidate.name}.`
      : "Public candidate profile on WHERE 2 RUN.",
  };
}

async function ownStanceIsEmpty(userId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("stance_vector")
    .eq("id", userId)
    .maybeSingle();

  if (error) return false;
  if (!data) return true;
  return data.stance_vector == null;
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const { id } = await params;
  const [candidate, loaded, viewer] = await Promise.all([
    loadCandidate(id),
    loadPublicCandidate(id),
    getServerUser(),
  ]);
  const showStanceCta =
    viewer != null && viewer.id === id && (await ownStanceIsEmpty(viewer.id));

  const error = candidate.error ?? loaded.error;
  const profile = loaded.profile;
  const visible = candidate.found || Boolean(profile);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        {error ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not load this candidate. {error}
          </p>
        ) : !visible ? (
          <MissingCandidate />
        ) : (
          <div className="flex flex-col gap-14">
            {showStanceCta ? (
              <Link
                href="/onboarding/stance"
                className="block rounded-xl border border-gold bg-zinc-900 px-5 py-5 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:bg-zinc-900/80"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
                  Stance vector
                </p>
                <p className="mt-2 text-sm leading-6 text-parchment">
                  Your ideological profile is empty. Complete the Stance Questionnaire to appear in Voter Matchmaking.
                </p>
              </Link>
            ) : null}
            <ProfileHeader
              candidateId={id}
              name={candidate.found ? candidate.name : (profile?.username ?? "Candidate")}
              verificationTier={profile?.verificationTier ?? "unverified"}
              districtLabel={profile?.ocdDistrict ?? profile?.targetDistrictName ?? null}
              districtVerified={profile?.ocdVerified ?? false}
              demographics={candidate.demographics}
              eloRating={candidate.found ? candidate.eloRating : (profile?.eloRating ?? DEFAULT_ELO)}
              record={candidate.record}
              eloLocked={profile?.eloLocked ?? false}
              lockedMatchCount={profile?.lockedMatchCount ?? 0}
              electionId={profile?.targetDistrictId ?? null}
            />
            {profile ? (
              <EscrowTracker
                total={profile.escrowTotal}
                count={profile.escrowCount}
                candidateName={candidate.found ? candidate.name : profile.username}
              />
            ) : null}
            <DebateHistory matches={candidate.matches} />
          </div>
        )}
      </div>
    </main>
  );
}

function MissingCandidate() {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Candidate not found</CardTitle>
        <CardDescription>
          This id is not on a ticket yet. Open a leaderboard and pick a name from the
          floor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/leaderboards"
          className="inline-flex h-10 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-4 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-gold hover:bg-zinc-900"
        >
          View leaderboards
        </Link>
      </CardContent>
    </Card>
  );
}
