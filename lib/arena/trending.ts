import { connection } from "next/server";
import { getExpiryState } from "@/lib/arena/time";
import { supabase } from "@/lib/db/supabase";
import type { DebateStatus, DebateWithCandidates, Vote } from "@/types/database.types";

const LIVE_STATUSES: DebateStatus[] = ["matching", "active", "voting"];

export type TrendingDebatePreview = DebateWithCandidates & {
  voteCount: number;
  aVotes: number;
  bVotes: number;
};

export async function getTrendingDebates(limit = 3): Promise<TrendingDebatePreview[]> {
  await connection();

  try {
    const [{ data, error: debateError }, { data: voteRows, error: voteError }] = await Promise.all([
      supabase
        .from("debates")
        .select(
          `
          *,
          candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
          candidate_b:users!debates_candidate_b_id_fkey ( id, username )
        `,
        )
        .in("status", LIVE_STATUSES)
        .order("created_at", { ascending: false }),
      supabase.from("votes").select("id, debate_id, candidate_id"),
    ]);

    if (debateError || voteError || !data) return [];

    const votesByDebate = new Map<string, Pick<Vote, "id" | "debate_id" | "candidate_id">[]>();
    for (const vote of (voteRows ?? []) as Pick<Vote, "id" | "debate_id" | "candidate_id">[]) {
      const list = votesByDebate.get(vote.debate_id) ?? [];
      list.push(vote);
      votesByDebate.set(vote.debate_id, list);
    }

    return ((data ?? []) as DebateWithCandidates[])
      .filter((debate) => getExpiryState(debate.expires_at).tone !== "expired")
      .map((debate) => {
        const rows = votesByDebate.get(debate.id) ?? [];
        const aVotes = rows.filter((vote) => vote.candidate_id === debate.candidate_a_id).length;
        const bVotes = rows.filter((vote) => vote.candidate_id === debate.candidate_b_id).length;
        return {
          ...debate,
          voteCount: rows.length,
          aVotes,
          bVotes,
        };
      })
      .sort((left, right) => {
        if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}
