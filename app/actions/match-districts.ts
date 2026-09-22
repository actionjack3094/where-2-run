"use server";

import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatPgIdeologyVector, parseVector } from "@/lib/ideology/vector";
import type { MatchedDistrictRow } from "@/types/database.types";

function isMissingMatchDistrictsRpc(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    /match_districts/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

export async function matchDistricts(
  queryEmbedding: number[] | string,
  matchThreshold = 0.5,
  matchCount = 10,
): Promise<MatchedDistrictRow[]> {
  const values = parseVector(queryEmbedding);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_districts", {
    query_embedding: formatPgIdeologyVector(values),
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    if (isMissingMatchDistrictsRpc(error)) {
      throw new Error(
        "match_districts is not installed. Apply the vector matching migration.",
      );
    }
    throw new Error(error.message);
  }

  return data ?? [];
}
