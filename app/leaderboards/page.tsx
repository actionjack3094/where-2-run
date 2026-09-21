import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BackCandidateButton } from "@/components/pledges/BackCandidateButton";
import { formatElectability, toNumber } from "@/lib/electability";
import type { CandidateStats, ElectabilityScore } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description:
    "District 9 candidates ranked by electability, debate record, and consistency.",
};

const DISTRICT_NAME = "Austin City Council - District 9";

type ScoreRow = Pick<ElectabilityScore, "user_id" | "electability_multiplier"> & {
  users:
    | { id: string; username: string }
    | { id: string; username: string }[]
    | null;
};

type LeaderboardEntry = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  avgConsistency: number | null;
  electability: number;
};

function unwrapUser(value: ScoreRow["users"]) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatRecord(wins: number, losses: number) {
  return `${wins}–${losses}`;
}

function formatConsistency(value: number | null) {
  if (value == null) return "—";
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

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

async function loadLeaderboard(): Promise<{
  districtName: string | null;
  entries: LeaderboardEntry[];
  error: string | null;
}> {
  const supabase = await createSupabase();

  const { data: district, error: districtError } = await supabase
    .from("districts")
    .select("id, name")
    .eq("name", DISTRICT_NAME)
    .maybeSingle();

  if (districtError) {
    return { districtName: null, entries: [], error: districtError.message };
  }

  if (!district) {
    return { districtName: DISTRICT_NAME, entries: [], error: null };
  }

  const [{ data: scoreRows, error: scoreError }, { data: statsRows, error: statsError }] =
    await Promise.all([
      supabase
        .from("electability_scores")
        .select("user_id, electability_multiplier, users(id, username)")
        .eq("district_id", district.id)
        .order("electability_multiplier", { ascending: false }),
      supabase
        .from("candidate_stats")
        .select("id, username, debates_won, debates_played")
        .eq("target_district_id", district.id),
    ]);

  if (scoreError) {
    return { districtName: district.name, entries: [], error: scoreError.message };
  }

  if (statsError) {
    return { districtName: district.name, entries: [], error: statsError.message };
  }

  const entriesById = new Map<string, LeaderboardEntry>();

  for (const stats of (statsRows ?? []) as Pick<
    CandidateStats,
    "id" | "username" | "debates_won" | "debates_played"
  >[]) {
    const wins = Math.max(0, stats.debates_won);
    const played = Math.max(wins, stats.debates_played);
    entriesById.set(stats.id, {
      id: stats.id,
      username: stats.username,
      wins,
      losses: played - wins,
      avgConsistency: null,
      electability: 0,
    });
  }

  for (const row of (scoreRows ?? []) as ScoreRow[]) {
    const user = unwrapUser(row.users);
    const id = user?.id ?? row.user_id;
    if (!id) continue;

    const current = entriesById.get(id);
    entriesById.set(id, {
      id,
      username: user?.username ?? current?.username ?? "Unnamed candidate",
      wins: current?.wins ?? 0,
      losses: current?.losses ?? 0,
      avgConsistency: current?.avgConsistency ?? null,
      electability: toNumber(row.electability_multiplier),
    });
  }

  const candidateIds = [...entriesById.keys()];
  if (candidateIds.length > 0) {
    const { data: argumentRows, error: argumentError } = await supabase
      .from("arguments")
      .select("author_id, consistency_score")
      .in("author_id", candidateIds)
      .not("consistency_score", "is", null);

    if (argumentError) {
      return {
        districtName: district.name,
        entries: [],
        error: argumentError.message,
      };
    }

    const totals = new Map<string, { sum: number; count: number }>();
    for (const row of (argumentRows ?? []) as {
      author_id: string;
      consistency_score: number | string | null;
    }[]) {
      const score = toNumber(row.consistency_score);
      if (!row.author_id) continue;
      const current = totals.get(row.author_id) ?? { sum: 0, count: 0 };
      current.sum += score;
      current.count += 1;
      totals.set(row.author_id, current);
    }

    for (const [id, total] of totals) {
      const entry = entriesById.get(id);
      if (!entry || total.count === 0) continue;
      entry.avgConsistency = total.sum / total.count;
    }
  }

  const entries = [...entriesById.values()].sort((left, right) => {
    if (right.electability !== left.electability) {
      return right.electability - left.electability;
    }
    if (right.wins !== left.wins) return right.wins - left.wins;
    return left.username.localeCompare(right.username);
  });

  return { districtName: district.name, entries, error: null };
}

export default async function LeaderboardsPage() {
  const { districtName, entries, error } = await loadLeaderboard();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              Leaderboards
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-parchment">
              District 9
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {districtName ?? DISTRICT_NAME}. Ranked by electability, then debate
              record.
            </p>
          </div>
        </header>

        {error ? (
          <p className="mt-16 text-sm leading-6 text-zinc-400">
            Could not load this leaderboard. {error}
          </p>
        ) : entries.length === 0 ? (
          <p className="mt-16 text-sm leading-6 text-zinc-400">
            No candidates ranked in District 9 yet. Win debates and take a stance to
            claim the board.
          </p>
        ) : (
          <section className="mt-10 flex flex-col gap-3">
            {entries.map((entry, index) => (
              <article
                key={entry.id}
                className="rounded-xl border border-gold/50 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--accent)]"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-zinc-500">
                      #{index + 1}
                    </p>
                    <div className="min-w-0">
                      <Link
                        href={`/candidate/${entry.id}`}
                        className="font-display text-lg font-semibold leading-snug tracking-tight text-parchment transition-colors hover:text-gold"
                      >
                        {entry.username}
                      </Link>
                      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                            Record
                          </dt>
                          <dd className="mt-1 font-medium tabular-nums text-zinc-100">
                            {formatRecord(entry.wins, entry.losses)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                            Avg consistency
                          </dt>
                          <dd className="mt-1 font-medium tabular-nums text-zinc-100">
                            {formatConsistency(entry.avgConsistency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                            Electability
                          </dt>
                          <dd className="mt-1 font-medium tabular-nums text-zinc-100">
                            {formatElectability(entry.electability)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <BackCandidateButton
                    candidate={{ id: entry.id, username: entry.username }}
                    className="shrink-0"
                  />
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
