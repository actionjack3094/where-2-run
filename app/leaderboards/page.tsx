import type { Metadata } from "next";
import { LeaderboardTriView } from "@/components/leaderboards/LeaderboardTriView";

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description:
    "Your contests, your ballot, and national standouts ranked by electability.",
};

export default function LeaderboardsPage() {
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
            Three boards: the races you are in, the candidates on your ballot, and the
            highest electability scores nationwide.
          </p>
        </header>
        <LeaderboardTriView />
      </div>
    </main>
  );
}
