import { parseElo } from "@/lib/arena/elo";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { cosineDistanceToMatchPercent } from "@/lib/ideology/stance";
import type { PrimaryOpponentRow } from "@/types/database.types";

/** RPC cap in `find_primary_opponents`. */
const MATCH_LIMIT = 25;

export type IdeologicalMatch = {
  id: string;
  name: string;
  elo: number;
  alignmentScore: number;
};

export async function getIdeologicalMatches(): Promise<IdeologicalMatch[]> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase.rpc("find_primary_opponents", {
    p_user_id: user.id,
    match_count: MATCH_LIMIT,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PrimaryOpponentRow[])
    .slice()
    .sort(
      (a, b) => Number(a.cosine_distance) - Number(b.cosine_distance),
    )
    .map((row) => ({
      id: row.id,
      name: row.username?.trim() || "Unnamed candidate",
      elo: parseElo(row.elo_rating),
      alignmentScore: cosineDistanceToMatchPercent(Number(row.cosine_distance)),
    }));
}
