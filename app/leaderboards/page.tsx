import type { Metadata } from "next";
import { LeaderboardTriView } from "@/components/leaderboards/LeaderboardTriView";
import { formatRecord } from "@/lib/leaderboard";
import { loadLeaderboardDashboard } from "@/lib/leaderboards/load-contests";
import { parseElo } from "@/lib/arena/elo";

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description:
    "Your contests, your ballot, and national standouts. Contests are scored by draft viability.",
};

export default async function LeaderboardsPage() {
  const dashboard = await loadLeaderboardDashboard();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Leaderboards
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            The Field
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Three boards: recommended races scored by draft viability, the
            candidates on your ballot, and the highest electability scores
            nationwide.
            {dashboard.profile ? (
              <>
                {" "}
                {dashboard.profile.username} is{" "}
                <span className="font-medium tabular-nums text-parchment">
                  {formatRecord(dashboard.profile.wins, dashboard.profile.losses)}
                </span>
                {" with ELO "}
                <span className="font-medium tabular-nums text-parchment">
                  {parseElo(dashboard.profile.eloRating)}
                </span>
                .
              </>
            ) : null}
          </p>
        </header>

        <LeaderboardTriView
          contests={dashboard.contests}
          signedIn={dashboard.signedIn}
          contestsError={dashboard.error}
        />
      </div>
    </main>
  );
}
