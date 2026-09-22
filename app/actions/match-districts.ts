"use server";

import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatPgIdeologyVector, parseVector } from "@/lib/ideology/vector";
import type { Candidate, MatchedDistrictRow, UserProfile } from "@/types/database.types";

function isMissingMatchDistrictsRpc(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    /match_districts/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

async function loadIdeologyVector(userId: string) {
  const admin = createAdminClient();

  const ticket = await admin
    .from("candidates")
    .select("ideology_vector")
    .eq("id", userId)
    .maybeSingle();

  if (ticket.error && !isMissingRelation(ticket.error)) {
    throw new Error(ticket.error.message);
  }

  const ticketVector = parseVector(
    (ticket.data as Pick<Candidate, "ideology_vector"> | null)?.ideology_vector,
  );
  if (ticketVector.length > 0) return ticketVector;

  const profile = await admin
    .from("users")
    .select("ideology_vector")
    .eq("id", userId)
    .maybeSingle();

  if (profile.error) throw new Error(profile.error.message);

  return parseVector(
    (profile.data as Pick<UserProfile, "ideology_vector"> | null)?.ideology_vector,
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

export async function matchCandidateDistricts(
  accessToken?: string | null,
): Promise<{ hasVector: boolean; matches: MatchedDistrictRow[] }> {
  const userId = await requireActionUserId(accessToken);
  if (!userId) {
    throw new Error("Sign in to match districts.");
  }

  const vector = await loadIdeologyVector(userId);
  if (vector.length === 0) {
    return { hasVector: false, matches: [] };
  }

  const matches = await matchDistricts(vector, 0, 3);
  return { hasVector: true, matches: matches.slice(0, 3) };
}
