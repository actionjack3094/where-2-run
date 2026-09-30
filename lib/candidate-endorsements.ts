import { isMissingRelation } from "@/lib/coalitions";
import { createServerSupabase } from "@/lib/db/supabase-server";

/**
 * Incoming coalition endorsements per candidate, for candidate preview cards.
 *
 * `coalition_endorsements` is publicly selectable under RLS, so this reads with
 * the caller's own client. Each candidate gets an exact head-count query (no
 * row transfer, no row-cap undercount); candidates with none are simply absent
 * from the map, and a database without the coalition tables yields an empty map.
 */
export async function loadEndorsementCounts(
  candidateIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) return counts;

  const supabase = await createServerSupabase();
  const results = await Promise.all(
    ids.map(async (id) => ({
      id,
      ...(await supabase
        .from("coalition_endorsements")
        .select("endorser_id", { count: "exact", head: true })
        .eq("endorsed_id", id)),
    })),
  );

  for (const result of results) {
    if (result.error) {
      if (isMissingRelation(result.error)) return new Map();
      throw new Error(result.error.message);
    }
    if ((result.count ?? 0) > 0) counts.set(result.id, result.count ?? 0);
  }

  return counts;
}
