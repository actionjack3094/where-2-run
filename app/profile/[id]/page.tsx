import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { cache } from "react";
import { PledgeEscrowButton } from "@/components/pledges/PledgeEscrowButton";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CoalitionBadge } from "@/components/coalitions/CoalitionBadge";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { isUuid } from "@/lib/arena/display";
import { hasTrustBadge, verificationLabel } from "@/lib/verification";
import { loadActiveCoalitionsForCandidate } from "@/lib/coalitions";
import {
  formatElectability,
  formatMatchPct,
  rankMatches,
  toNumber,
  unwrapDistrict,
  type ElectabilityMatch,
} from "@/lib/electability";
import { formatRecord, recordFromStats } from "@/lib/leaderboard";
import type { CandidateStats, Coalition, District, ElectabilityScore } from "@/types/database.types";

type ProfileParams = { id: string };

type ScoreRow = ElectabilityScore & {
  districts: District | District[] | null;
};

type PublicProfile = {
  stats: CandidateStats;
  record: { wins: number; losses: number };
  matches: ElectabilityMatch[];
  filedDistrict: District | null;
  coalitions: Coalition[];
};

async function createSupabase() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot persist refreshed auth cookies.
        }
      },
    },
  });
}

const loadPublicProfile = cache(async (id: string): Promise<{
  profile: PublicProfile | null;
  error: string | null;
}> => {
  if (!isUuid(id)) {
    return { profile: null, error: null };
  }

  const supabase = await createSupabase();
  const { data: statsRow, error: statsError } = await supabase
    .from("candidate_stats")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (statsError) {
    return { profile: null, error: statsError.message };
  }

  if (!statsRow) {
    return { profile: null, error: null };
  }

  const stats = statsRow as CandidateStats;

  const { data: userRow } = await supabase
    .from("users")
    .select("verification_tier")
    .eq("id", id)
    .maybeSingle();

  if (userRow?.verification_tier) {
    stats.verification_tier = userRow.verification_tier;
  }
  const { data: scoreRows, error: scoreError } = await supabase
    .from("electability_scores")
    .select("*, districts(*)")
    .eq("user_id", id);

  if (scoreError) {
    return { profile: null, error: scoreError.message };
  }

  const matches: ElectabilityMatch[] = [];
  for (const row of (scoreRows ?? []) as ScoreRow[]) {
    const district = unwrapDistrict(row.districts);
    if (!district) continue;
    matches.push({
      id: row.id,
      user_id: row.user_id,
      district_id: row.district_id,
      ideological_match_pct: row.ideological_match_pct,
      debate_win_rate: row.debate_win_rate,
      total_escrow_pledged: row.total_escrow_pledged,
      legal_eligibility_integer: row.legal_eligibility_integer,
      electability_multiplier: row.electability_multiplier,
      created_at: row.created_at,
      updated_at: row.updated_at,
      district,
    });
  }

  let filedDistrict: District | null =
    matches.find((row) => row.district_id === stats.target_district_id)?.district ?? null;

  if (!filedDistrict && stats.target_district_id) {
    const { data: districtRow, error: districtError } = await supabase
      .from("districts")
      .select("*")
      .eq("id", stats.target_district_id)
      .maybeSingle();
    if (districtError) {
      return { profile: null, error: districtError.message };
    }
    filedDistrict = (districtRow as District | null) ?? null;
  }

  const { coalitions, error: coalitionError } = await loadActiveCoalitionsForCandidate(id);
  if (coalitionError) {
    return { profile: null, error: coalitionError };
  }

  return {
    profile: {
      stats,
      record: recordFromStats(stats),
      matches: rankMatches(matches).slice(0, 5),
      filedDistrict,
      coalitions,
    },
    error: null,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<ProfileParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await loadPublicProfile(id);
  const name = profile?.stats.username;

  return {
    title: name ? `${name} · Public Profile` : "Public Profile · WHERE 2 RUN",
    description: name
      ? `Debate record, matched elections, and campaign support for ${name}.`
      : "Public candidate profile on WHERE 2 RUN.",
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<ProfileParams>;
}) {
  const { id } = await params;
  const { profile, error } = await loadPublicProfile(id);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        {error ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not load this profile. {error}
          </p>
        ) : !profile ? (
          <MissingProfile />
        ) : (
          <ReadyProfile profile={profile} />
        )}
      </div>
    </main>
  );
}

function ReadyProfile({ profile }: { profile: PublicProfile }) {
  const { stats, record, matches, filedDistrict, coalitions } = profile;

  return (
    <>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <CandidateAvatar name={stats.username} size="lg" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Public Profile
            </p>
            <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-parchment">
              <span className="min-w-0 truncate">{stats.username}</span>
              <VerificationBadge tier={stats.verification_tier} size="lg" />
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Debate record{" "}
              <span className="font-medium tabular-nums text-parchment">
                {formatRecord(record.wins, record.losses)}
              </span>
              {hasTrustBadge(stats.verification_tier)
                ? ` · ${verificationLabel(stats.verification_tier)}`
                : stats.is_verified
                  ? " · Verified"
                  : null}
            </p>
            {coalitions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {coalitions.map((coalition) => (
                  <CoalitionBadge key={coalition.id} name={coalition.name} size="sm" />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <PledgeEscrowButton
          candidateId={stats.id}
          candidateName={stats.username}
          electionId={filedDistrict?.id ?? matches[0]?.district_id ?? null}
          className="shrink-0"
        />
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3">
        <StatCard label="Wins" value={record.wins} />
        <StatCard label="Losses" value={record.losses} />
      </section>

      <section className="mt-14">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Filing Board
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
          Top Matched Elections
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Seats ranked by electability for this campaign.
        </p>

        {matches.length === 0 ? (
          filedDistrict ? (
            <Link href={`/district/${filedDistrict.id}`} className="mt-6 block">
              <article className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold">
                <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                  Filed seat
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                  {filedDistrict.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {filedDistrict.historical_lean ?? "Lean unpublished"} ·{" "}
                  {filedDistrict.level}
                </p>
              </article>
            </Link>
          ) : (
            <p className="mt-8 text-sm leading-6 text-zinc-400">
              No matched elections on file yet. Scores appear after this candidate files a
              district.
            </p>
          )
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {matches.map((match, index) => (
              <MatchRow key={match.id} match={match} rank={index + 1} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-14">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Alliances
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
          Coalitions & Endorsements
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Electoral caucuses this campaign has seated, shown as gold endorsements.
        </p>
        {coalitions.length === 0 ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            This campaign has not seated in a coalition yet.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {coalitions.map((coalition) => (
              <li
                key={coalition.id}
                className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
              >
                <CoalitionBadge name={coalition.name} />
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {coalition.charter_statement}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-gold">{label}</p>
        <p className="font-display text-3xl font-semibold tabular-nums tracking-tight text-parchment">
          {value}
        </p>
      </CardHeader>
    </Card>
  );
}

function MatchRow({ match, rank }: { match: ElectabilityMatch; rank: number }) {
  const eligible = toNumber(match.legal_eligibility_integer) === 1;

  return (
    <Link href={`/district/${match.district.id}`} className="block">
      <article className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              #{rank} · {match.district.historical_lean ?? "Lean unpublished"}
            </p>
            <h3 className="mt-2 font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
              {match.district.name}
            </h3>
          </div>
          <p className="shrink-0 font-mono text-xs font-medium uppercase text-gold">
            {formatElectability(match.electability_multiplier)} electability
          </p>
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Ideology match
            </dt>
            <dd className="mt-1 font-medium tabular-nums text-zinc-100">
              {formatMatchPct(match.ideological_match_pct)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Qualification
            </dt>
            <dd className="mt-1 font-medium uppercase tracking-widest text-gold">
              {eligible ? "Qualified" : "Ineligible"}
            </dd>
          </div>
        </dl>
      </article>
    </Link>
  );
}

function MissingProfile() {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Candidate not found</CardTitle>
        <CardDescription>
          This profile is not on a ticket yet. Open a leaderboard and pick a name from
          the floor.
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
