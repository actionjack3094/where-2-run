import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/app/components/search-bar";
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

function ilikeContains(value: string) {
  return `%${value.replace(/[%_\\]/g, "\\$&")}%`;
}

export default async function LeaderboardsPage(props: PageProps<"/leaderboards">) {
  const searchParams = await props.searchParams;
  const rawQuery = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = rawQuery?.trim() || undefined;

  const supabase = await createServerSupabase();
  let ranked = supabase
    .from("candidate_stats")
    .select("id, username, elo_rating, debates_won, debates_played")
    .order("elo_rating", { ascending: false })
    .order("debates_won", { ascending: false })
    .limit(50);

  if (q) {
    ranked = ranked.ilike("username", ilikeContains(q));
  }

  const { data, error } = await ranked;

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
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-[0.18em] text-parchment">
            LEADERBOARDS
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Candidates ranked by ELO. The record is debate wins and losses.
          </p>
        </header>

        <div className="mt-8">
          <SearchBar placeholder="Search..." />
        </div>

        {error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{error.message}</p>
        ) : candidates.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            {q ? `No candidates match "${q}".` : "No candidates are on the board yet."}
          </p>
        ) : (
          <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  href={`/candidate/${candidate.id}`}
                  className="group flex h-full flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5 transition-all hover:border-zinc-500"
                >
                  <span className="font-display text-lg tabular-nums text-gold">
                    {candidate.rank}
                  </span>
                  <span className="min-w-0 truncate font-medium text-parchment group-hover:text-gold">
                    {candidate.name}
                  </span>
                  <span>
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
