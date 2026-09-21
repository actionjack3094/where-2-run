"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  cosineDistanceToMatchPercent,
  hasStanceVector,
  isMissingMatchmakerRpc,
  isMissingStanceColumn,
  PRIMARY_OPPONENT_LIMIT,
} from "@/lib/ideology/stance";
import type { PrimaryOpponentRow } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PrimaryOpponent = PrimaryOpponentRow & {
  matchPercent: number;
};

export type MatchmakerResult = {
  userId: string | null;
  hasStance: boolean;
  matches: PrimaryOpponent[];
};

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingStanceColumn(error)) {
      throw new Error(
        "stance_vector must be vector(5). Apply the pgvector matchmaker migration.",
      );
    }
    throw new Error(error.message);
  }

  if (existing) return;

  const username = `runner-${userId.slice(0, 6)}`;
  const { error: insertError } = await admin.from("users").insert({
    id: userId,
    username,
  });

  if (insertError) {
    if (isMissingStanceColumn(insertError)) {
      throw new Error(
        "stance_vector must be vector(5). Apply the pgvector matchmaker migration.",
      );
    }
    throw new Error(insertError.message);
  }
}

async function requireCandidate(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to open the proving ground.");
  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);
  return { admin, userId };
}

function toNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapOpponent(row: PrimaryOpponentRow): PrimaryOpponent {
  const cosineDistance = toNumber(row.cosine_distance);
  return {
    ...row,
    elo_rating: Math.round(toNumber(row.elo_rating) || 1200),
    cosine_distance: cosineDistance,
    similarity: toNumber(row.similarity),
    matchPercent: cosineDistanceToMatchPercent(cosineDistance),
  };
}

export async function findPrimaryOpponents(
  accessToken?: string | null,
): Promise<MatchmakerResult> {
  const userId = await requireActionUserId(accessToken);
  if (!userId) {
    return { userId: null, hasStance: false, matches: [] };
  }

  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const { data: self, error: selfError } = await admin
    .from("users")
    .select("id, stance_vector")
    .eq("id", userId)
    .maybeSingle();

  if (selfError) {
    if (isMissingStanceColumn(selfError) || isMissingMatchmakerRpc(selfError)) {
      throw new Error(
        "stance_vector must be vector(5). Apply the pgvector matchmaker migration.",
      );
    }
    throw new Error(selfError.message);
  }

  const hasStance = hasStanceVector(self?.stance_vector);
  if (!hasStance) {
    return { userId, hasStance: false, matches: [] };
  }

  const { data, error } = await admin.rpc("find_primary_opponents", {
    p_user_id: userId,
    match_count: PRIMARY_OPPONENT_LIMIT,
  });

  if (error) {
    if (isMissingMatchmakerRpc(error) || isMissingStanceColumn(error)) {
      throw new Error(
        "find_primary_opponents is not installed. Apply the pgvector matchmaker migration.",
      );
    }
    throw new Error(error.message);
  }

  const matches = (data ?? []).slice(0, PRIMARY_OPPONENT_LIMIT).map(mapOpponent);
  return { userId, hasStance: true, matches };
}

export async function challengeToDebate(
  opponentId: string,
  accessToken?: string | null,
) {
  const trimmedId = opponentId.trim();
  if (!isUuid(trimmedId)) {
    throw new Error("A valid opponent is required.");
  }

  const { admin, userId } = await requireCandidate(accessToken);
  if (trimmedId === userId) {
    throw new Error("You cannot challenge yourself.");
  }

  const [{ data: opponent, error: opponentError }, { data: viewer, error: viewerError }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, username, target_district_id")
        .eq("id", trimmedId)
        .maybeSingle(),
      admin
        .from("users")
        .select("id, username, target_district_id")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (opponentError) throw new Error(opponentError.message);
  if (viewerError) throw new Error(viewerError.message);
  if (!opponent) throw new Error("Opponent not found.");

  const districtId = [viewer?.target_district_id, opponent.target_district_id].find(
    (value) => value && isUuid(value),
  );

  const { data: debate, error } = await admin
    .from("debates")
    .insert({
      topic: `Primary proving ground: ${viewer?.username ?? "challenger"} vs ${opponent.username}`,
      district_id: districtId ?? null,
      candidate_a_id: userId,
      candidate_b_id: trimmedId,
      status: "active",
      current_round: 1,
    })
    .select("id")
    .single();

  if (error || !debate) {
    throw new Error(error?.message ?? "Could not open the debate.");
  }

  revalidatePath("/my-campaign");
  revalidatePath("/arena");
  revalidatePath(`/arena/${debate.id}`);
  return { matchId: debate.id };
}
