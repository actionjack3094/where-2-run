import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { CandidateProfile, type LockedCampaignTarget } from "@/app/components/CandidateProfile";
import { TargetRaceButton } from "@/app/components/TargetRaceButton";
import { type PledgeRaceOption } from "@/app/components/PledgeModal";
import { DebateHistory, type MatchOutcome, type ProfileMatch } from "@/components/candidate/DebateHistory";
import { EscrowTracker } from "@/components/candidate/EscrowTracker";
import { CandidateCoalitionSummary } from "@/components/coalitions/CandidateCoalitionSummary";
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
import { loadCandidateCoalitionSummary } from "@/lib/candidate-coalitions";
import { loadPublicCandidate } from "@/lib/candidate-profile";
import { formatCandidacyLabel } from "@/lib/campaign/targets";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import { normalizeEscrowStatus, officialDonationHref } from "@/lib/escrow/candidacy";
import { formatRecord, recordFromStats } from "@/lib/leaderboard";
import { resolveHomeLeaderboardElection } from "@/lib/queries/leaderboard";

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
      .in("status", ["completed", "resolved"])
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

async function loadLockedTargets(candidateId: string): Promise<LockedCampaignTarget[]> {
  try {
    const admin = createAdminClient();
    const loaded = await admin
      .from("campaign_targets")
      .select("id, pledged_escrow, election_id, escrow_status, donation_url")
      .eq("user_id", candidateId)
      .eq("is_locked", true);

    const data = loaded.error && isMissingSchema(loaded.error)
      ? (
          await admin
            .from("campaign_targets")
            .select("id, pledged_escrow, election_id")
            .eq("user_id", candidateId)
            .eq("is_locked", true)
        ).data
      : loaded.data;

    if (loaded.error && !isMissingSchema(loaded.error)) return [];
    if (!data?.length) return [];

    const rows = data as {
      id: string;
      pledged_escrow: number | string | null;
      election_id: string;
      escrow_status?: string | null;
      donation_url?: string | null;
    }[];
    const { data: elections } = await admin
      .from("elections")
      .select("id, office_name")
      .in(
        "id",
        rows.map((row) => row.election_id),
      );
    const names = new Map(
      ((elections ?? []) as { id: string; office_name: string | null }[]).map((row) => [
        row.id,
        row.office_name?.trim() || "Open race",
      ]),
    );

    return rows.map((row) => ({
      id: row.id,
      label: names.get(row.election_id) ?? "Open race",
      pledgedEscrow: Number(row.pledged_escrow ?? 0) || 0,
      escrowStatus: normalizeEscrowStatus(row.escrow_status),
      donationUrl: officialDonationHref(row.donation_url),
    }));
  } catch {
    return [];
  }
}

async function loadPledgeRaces(candidateId: string): Promise<PledgeRaceOption[]> {
  try {
    const admin = createAdminClient();
    const { data: targets, error: targetError } = await admin
      .from("campaign_targets")
      .select("election_id")
      .eq("user_id", candidateId);

    if (targetError && !isMissingRelation(targetError) && !isMissingSchema(targetError)) {
      return [];
    }

    const fromTargets = [
      ...new Set(
        ((targets ?? []) as { election_id: string }[])
          .map((row) => row.election_id)
          .filter(Boolean),
      ),
    ];

    const electionIds = fromTargets;
    if (electionIds.length === 0) {
      const { data: profile } = await admin
        .from("users")
        .select("target_district_id, home_ocd_ids")
        .eq("id", candidateId)
        .maybeSingle();
      const districtId = (profile as { target_district_id?: string | null } | null)?.target_district_id;
      const homeIds = Array.isArray((profile as { home_ocd_ids?: unknown } | null)?.home_ocd_ids)
        ? ((profile as { home_ocd_ids: unknown[] }).home_ocd_ids.filter(
            (id): id is string => typeof id === "string" && id.trim() !== "",
          ))
        : [];

      const { data: elections } = await admin
        .from("elections")
        .select("id, office_name, ocd_id, election_date, district_id");
      const rows = (elections ?? []) as {
        id: string;
        office_name: string;
        ocd_id?: string | null;
        election_date?: string | null;
        district_id?: string | null;
      }[];
      const matched = rows.filter(
        (row) =>
          (districtId && row.district_id === districtId) ||
          (row.ocd_id != null && homeIds.includes(row.ocd_id)),
      );
      return matched.map((row) => ({
        electionId: row.id,
        label: formatCandidacyLabel(row.office_name, row.ocd_id, row.election_date),
      }));
    }

    const { data: elections } = await admin
      .from("elections")
      .select("id, office_name, ocd_id, election_date")
      .in("id", electionIds);

    return ((elections ?? []) as {
      id: string;
      office_name: string;
      ocd_id?: string | null;
      election_date?: string | null;
    }[]).map((row) => ({
      electionId: row.id,
      label: formatCandidacyLabel(row.office_name, row.ocd_id, row.election_date),
    }));
  } catch {
    return [];
  }
}

async function loadOwnTargetRaces(userId: string) {
  try {
    const admin = createAdminClient();
    const { data: targets, error } = await admin
      .from("campaign_targets")
      .select("election_id")
      .eq("user_id", userId);
    if (error && !isMissingRelation(error) && !isMissingSchema(error)) return [];

    let electionIds = [
      ...new Set(
        ((targets ?? []) as { election_id: string }[])
          .map((row) => row.election_id)
          .filter(Boolean),
      ),
    ];
    if (electionIds.length === 0) {
      const home = await resolveHomeLeaderboardElection(userId);
      if (home) electionIds = [home.id];
    }
    if (electionIds.length === 0) return [];

    const { data: elections } = await admin
      .from("elections")
      .select("id, office_name, ocd_id, election_date")
      .in("id", electionIds);

    return ((elections ?? []) as {
      id: string;
      office_name: string;
      ocd_id?: string | null;
      election_date?: string | null;
    }[]).map((row) => ({
      id: row.id,
      label: formatCandidacyLabel(row.office_name, row.ocd_id, row.election_date),
    }));
  } catch {
    return [];
  }
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
  const { id: candidateId } = await params;
  const [candidate, loaded, user, lockedTargets, coalitionSummary, pledgeRaces] = await Promise.all([
    loadCandidate(candidateId),
    loadPublicCandidate(candidateId),
    getServerUser(),
    loadLockedTargets(candidateId),
    isUuid(candidateId)
      ? loadCandidateCoalitionSummary(candidateId).catch(() => null)
      : Promise.resolve(null),
    isUuid(candidateId) ? loadPledgeRaces(candidateId) : Promise.resolve([]),
  ]);
  const viewingOwnProfile = user != null && user.id === candidateId;
  const targetRaces = viewingOwnProfile ? await loadOwnTargetRaces(user.id) : [];
  const showStanceCta = viewingOwnProfile && (await ownStanceIsEmpty(user.id));

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
            {viewingOwnProfile && targetRaces.length > 0 ? (
              <section className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
                  Targeting
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
                  Lock a race
                </h2>
                <ul className="mt-4 flex flex-col gap-4">
                  {targetRaces.map((race) => (
                    <li key={race.id}>
                      <p className="text-sm text-zinc-400">{race.label}</p>
                      <TargetRaceButton className="mt-2" election_id={race.id} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <CandidateProfile
              candidateName={candidate.found ? candidate.name : (profile?.username ?? "Candidate")}
              lockedTargets={lockedTargets}
              viewingOwnProfile={viewingOwnProfile}
            />
            <ProfileHeader
              candidateId={candidateId}
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
              pledge={
                viewingOwnProfile
                  ? null
                  : {
                      races: pledgeRaces,
                      signedIn: user != null,
                    }
              }
            />
            {coalitionSummary ? (
              <CandidateCoalitionSummary
                summary={coalitionSummary}
                candidateName={candidate.found ? candidate.name : (profile?.username ?? "Candidate")}
              />
            ) : null}
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
