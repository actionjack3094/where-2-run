import type { Metadata } from "next";
import Link from "next/link";
import { parseElo } from "@/lib/arena/elo";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { formatRecord, recordFromStats } from "@/lib/leaderboard";

export const metadata: Metadata = {
  title: "Leaderboards · WHERE 2 RUN",
  description: "Candidates ranked by ELO, with their debate win-loss record.",
};

type RankedCandidate = {
  id: string;
  username: string | null;
  elo_rating: number | string | null;
  debates_won: number | null;
  debates_played: number | null;
};

export default async function LeaderboardsPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("candidate_stats")
    .select("id, username, elo_rating, debates_won, debates_played")
    .order("elo_rating", { ascending: false })
    .order("debates_won", { ascending: false })
    .limit(50);

  const candidates = ((data ?? []) as RankedCandidate[]).map((row, index) => {
    const record = recordFromStats({
      debates_won: row.debates_won ?? 0,
      debates_played: row.debates_played ?? 0,
    });
    return {
      id: row.id,
      rank: index + 1,
      name: row.username?.trim() || "Unnamed candidate",
      elo: parseElo(row.elo_rating),
      wins: record.wins,
      losses: record.losses,
    };
  });

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
            LEADERBOARDS
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Candidates ranked by ELO. The record is debate wins and losses.
          </p>
        </header>

        {error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{error.message}</p>
        ) : candidates.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No candidates are on the board yet.
          </p>
        ) : (
          <ol className="mt-10 divide-y divide-zinc-800 border-y border-zinc-800">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  href={`/candidate/${candidate.id}`}
                  className="flex items-center gap-4 py-4 transition-colors hover:text-gold"
                >
                  <span className="w-10 shrink-0 font-display text-lg tabular-nums text-gold">
                    {candidate.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-parchment">
                    {candidate.name}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm tabular-nums text-zinc-100">
                      {formatRecord(candidate.wins, candidate.losses)}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {candidate.elo} ELO
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
