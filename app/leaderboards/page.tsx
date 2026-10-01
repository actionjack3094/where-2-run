import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listActiveLeaderboardRaces,
  resolveHomeLeaderboardElection,
} from "@/lib/queries/leaderboard";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description: "Active district races ranked by Elo, alignment streak, and pledged escrow.",
};

export default async function LeaderboardsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const [{ all }, user] = await Promise.all([searchParams, getServerUser()]);
  const showDirectory = all === "1" || all === "true";

  if (!showDirectory) {
    const home = await resolveHomeLeaderboardElection(user?.id ?? null);
    if (home) redirect(`/leaderboards/${home.id}`);
  }

  const races = await listActiveLeaderboardRaces();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            Leaderboards
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Active races
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Open a district board to see declared candidates ranked by Elo, streak, and escrow.
          </p>
        </header>

        {races.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No one has declared a race yet. Candidates appear here once they run for office.
          </p>
        ) : (
          <ul className="mt-10 flex flex-col gap-3">
            {races.map((race) => (
              <li key={race.id}>
                <Link
                  href={`/leaderboards/${race.id}`}
                  className="block rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5 transition-colors hover:border-gold"
                >
                  <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                    {race.candidateCount}{" "}
                    {race.candidateCount === 1 ? "candidate" : "candidates"}
                  </p>
                  <p className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
                    {race.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{race.officeName}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
