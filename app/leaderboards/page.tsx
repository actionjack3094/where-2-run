import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { RankCalibrationBanner } from "@/app/leaderboards/components/RankCalibrationBanner";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";
import { loadLeaderboardDashboard } from "@/lib/leaderboards/dashboard";
import { listActiveLeaderboardRaces } from "@/lib/queries/leaderboard";

export const dynamic = "force-dynamic";

const RANK_MATCHES = 5;

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description: "Active district races ranked by Elo, alignment streak, and pledged escrow.",
};

async function resolvedMatchCount(userId: string) {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("debates")
      .select("id", { count: "exact", head: true })
      .in("status", ["resolved", "completed"])
      .or(`candidate_a_id.eq.${userId},candidate_b_id.eq.${userId}`);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export default async function LeaderboardsIndexPage() {
  const user = await getServerUser();
  const [dashboard, races, resolved] = await Promise.all([
    loadLeaderboardDashboard(user?.id ?? null),
    listActiveLeaderboardRaces(),
    user ? resolvedMatchCount(user.id) : Promise.resolve(null),
  ]);
  const remaining =
    user && resolved != null ? Math.max(0, RANK_MATCHES - resolved) : 0;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            Leaderboards
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            The floor
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Your matched rank, the backyard floor, the tightest arenas, and every race with a
            declared candidate.
          </p>
        </header>

        {remaining > 0 ? (
          <div className="mt-8">
            <RankCalibrationBanner remaining={remaining} />
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel
            kicker="Matched districts"
            title="Your rank"
            error={dashboard.matched.error}
            empty={
              !user
                ? "Sign in to see where you stand in the races that match your ideology."
                : dashboard.matched.elections.length === 0
                  ? "No matched races yet. Take a stance to open this board."
                  : null
            }
          >
            {dashboard.matched.rank != null ? (
              <p className="font-display text-3xl font-semibold tabular-nums text-gold">
                #{dashboard.matched.rank}
                <span className="ml-2 text-base font-medium text-zinc-400">
                  of {dashboard.matched.fieldSize} · {dashboard.matched.elo} Elo
                </span>
              </p>
            ) : null}
            <ul className="mt-4 flex flex-col gap-2">
              {dashboard.matched.board.slice(0, 5).map((person) => (
                <li key={person.id}>
                  <Link
                    href={`/candidate/${person.id}`}
                    className="flex items-baseline justify-between gap-3 text-sm text-parchment hover:text-gold"
                  >
                    <span>
                      #{person.rank} {person.name}
                      {person.isViewer ? " · you" : ""}
                    </span>
                    <span className="tabular-nums text-zinc-400">{person.elo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            kicker="Home ballot"
            title="Grassroots floor"
            error={dashboard.grassroots.error}
            empty={
              !user
                ? "Sign in to see debates on your physical ballot."
                : dashboard.grassroots.policies.length === 0
                  ? "No backyard debates in your home district yet."
                  : null
            }
          >
            <ul className="flex flex-col gap-3">
              {dashboard.grassroots.policies.slice(0, 5).map((policy) => (
                <li key={policy.id}>
                  <Link href={`/debates/${policy.id}`} className="block hover:text-gold">
                    <p className="text-sm leading-6 text-parchment">{policy.title}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {policy.votes} votes · {policy.comments} comments
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            kicker="Elo spread"
            title="Tightest arenas"
            error={dashboard.arenas.error}
            empty={
              dashboard.arenas.races.length === 0
                ? "No race has three contenders close enough to rank yet."
                : null
            }
          >
            <ul className="flex flex-col gap-3">
              {dashboard.arenas.races.slice(0, 4).map((race) => (
                <li key={race.id}>
                  <Link href={`/leaderboards/${race.id}`} className="block hover:text-gold">
                    <p className="text-sm font-medium text-parchment">{race.name}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {race.spread} Elo between the top three
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            kicker="Declared"
            title="Active races"
            empty={races.length === 0 ? "No one has declared a race yet." : null}
          >
            <ul className="flex flex-col gap-3">
              {races.slice(0, 6).map((race) => (
                <li key={race.id}>
                  <Link href={`/leaderboards/${race.id}`} className="block hover:text-gold">
                    <p className="text-sm font-medium text-parchment">{race.label}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {race.candidateCount}{" "}
                      {race.candidateCount === 1 ? "candidate" : "candidates"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({
  kicker,
  title,
  error,
  empty,
  children,
}: {
  kicker: string;
  title: string;
  error?: string | null;
  empty?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className="flex min-h-64 flex-col rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">{kicker}</p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
        {title}
      </h2>
      {error ? (
        <p className="mt-4 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : empty ? (
        <p className="mt-4 text-sm leading-6 text-zinc-400">{empty}</p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}
