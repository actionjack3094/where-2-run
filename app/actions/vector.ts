"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { applyIdeologyEma } from "@/lib/feed/ema";
import { IDEOLOGY_EMA_ALPHA } from "@/lib/feed/types";
import { buildUserVector } from "@/lib/ideology/questions";
import {
  buildStanceVector,
  formatPgStanceVector,
  isMissingStanceColumn,
} from "@/lib/ideology/stance";
import {
  emptySixAxis,
  formatSixAxisVector,
  SIX_AXIS_IDS,
  toSixAxisVector,
  type SixAxisId,
  type SixAxisVector,
} from "@/lib/ideology/six-axis";
import { clamp01, formatPgIdeologyVector, parseVector } from "@/lib/ideology/vector";
import type { StanceAxis } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingStanceColumn(error)) {
      throw new Error(
        "stance_vector is not on profiles yet. Apply the stance vector migration.",
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
        "stance_vector is not on profiles yet. Apply the stance vector migration.",
      );
    }
    throw new Error(insertError.message);
  }
}

async function requireCandidate(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to file a stance vector.");
  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);
  return { admin, userId };
}

export async function saveBaselineStanceVector(
  answers: Partial<Record<StanceAxis, number>>,
  accessToken?: string | null,
) {
  const stanceVector = buildStanceVector(answers);
  const { admin, userId } = await requireCandidate(accessToken);

  const { error } = await admin
    .from("users")
    .update({
      stance_vector: formatPgStanceVector(stanceVector),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    if (isMissingStanceColumn(error)) {
      throw new Error(
        "stance_vector must be vector(5). Apply the pgvector matchmaker migration.",
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/my-campaign");
  revalidatePath("/onboarding/ideology");
  revalidatePath(`/profile/${userId}`);
  redirect("/my-campaign");
}

export type UpdateVectorInput = {
  axisId: SixAxisId;
  score: number;
};

function isSixAxisId(value: string): value is SixAxisId {
  return (SIX_AXIS_IDS as readonly string[]).includes(value);
}

function isMissingVectorRpc(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /update_ideology_vector_ema/i.test(message) ||
    /schema cache/i.test(message)
  );
}

function stanceFromAnswer(current: unknown, axisId: SixAxisId, score: number): SixAxisVector {
  const previous = toSixAxisVector(current);
  const stance = emptySixAxis();
  for (let index = 0; index < stance.length; index += 1) {
    stance[index] = previous[index] ?? 0.5;
  }
  const axisIndex = SIX_AXIS_IDS.indexOf(axisId);
  if (axisIndex >= 0) stance[axisIndex] = clamp01(score);
  return stance;
}

export async function updateVector(
  input: UpdateVectorInput,
  accessToken?: string | null,
) {
  if (!isSixAxisId(input.axisId)) {
    throw new Error("That policy axis is not on the six-axis coordinate.");
  }

  const { admin, userId } = await requireCandidate(accessToken);
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("ideology_vector")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  const stance = stanceFromAnswer(profile?.ideology_vector, input.axisId, input.score);
  const { error } = await admin.rpc("update_ideology_vector_ema", {
    p_user_id: userId,
    p_stance_vector: formatSixAxisVector(stance),
    p_alpha: IDEOLOGY_EMA_ALPHA,
  });

  let stored = parseVector(profile?.ideology_vector);

  if (error) {
    if (!isMissingVectorRpc(error) && !isMissingStanceColumn(error)) {
      console.warn("Ideology EMA RPC failed; applying local EMA.", error.message);
    }
    const next = applyIdeologyEma(profile?.ideology_vector, stance, IDEOLOGY_EMA_ALPHA);
    stored = next.ten;
    const { error: updateError } = await admin
      .from("users")
      .update({
        ideology_vector: formatPgIdeologyVector(next.ten),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (updateError && !isMissingStanceColumn(updateError)) {
      throw new Error(updateError.message);
    }
  } else {
    const { data: refreshed, error: refreshError } = await admin
      .from("users")
      .select("ideology_vector")
      .eq("id", userId)
      .maybeSingle();
    if (refreshError) throw new Error(refreshError.message);
    stored = parseVector(refreshed?.ideology_vector);
    if (stored.length === 0) {
      stored = buildUserVector([...toSixAxisVector(stance)]);
    }
  }

  const ten =
    stored.length >= 10 ? stored.slice(0, 10) : buildUserVector([...toSixAxisVector(stored)]);
  const { error: candidateError } = await admin
    .from("candidates")
    .update({
      ideology_vector: formatPgIdeologyVector(ten),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (
    candidateError &&
    !isMissingRelation(candidateError) &&
    !isMissingStanceColumn(candidateError)
  ) {
    console.warn("Could not mirror ideology_vector onto candidates.", candidateError.message);
  }

  revalidatePath("/profile");
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/my-campaign");

  return { ideologyVector: stored.length > 0 ? stored : ten };
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

async function mirrorCandidateIdeology(
  admin: AdminClient,
  userId: string,
  username: string,
  ideologyVector: string,
) {
  const now = new Date().toISOString();
  const updated = await admin
    .from("candidates")
    .update({
      ideology_vector: ideologyVector,
      updated_at: now,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (updated.error) {
    if (isMissingRelation(updated.error)) {
      throw new Error(
        "candidates is not on the database yet. Apply the candidate onboarding migration.",
      );
    }
    throw new Error(updated.error.message);
  }
  if (updated.data) return;

  const inserted = await admin
    .from("candidates")
    .insert({
      id: userId,
      display_name: username,
      ideology_vector: ideologyVector,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (inserted.error && !isUniqueViolation(inserted.error)) {
    if (isMissingRelation(inserted.error)) {
      throw new Error(
        "candidates is not on the database yet. Apply the candidate onboarding migration.",
      );
    }
    throw new Error(inserted.error.message);
  }
}

/** Write the six-axis quiz as the baseline ideology vector (EMA alpha = 1). */
export async function establishBaselineIdeologyVector(
  answers: Partial<Record<SixAxisId, number>>,
  accessToken?: string | null,
) {
  const stance = emptySixAxis();
  for (let index = 0; index < SIX_AXIS_IDS.length; index += 1) {
    const axisId = SIX_AXIS_IDS[index];
    const score = answers[axisId];
    if (score == null || !Number.isFinite(score)) {
      throw new Error("Answer every policy axis before calibrating your vector.");
    }
    stance[index] = clamp01(score);
  }

  const { admin, userId } = await requireCandidate(accessToken);
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("username, ideology_vector")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  const { error } = await admin.rpc("update_ideology_vector_ema", {
    p_user_id: userId,
    p_stance_vector: formatSixAxisVector(stance),
    p_alpha: 1,
  });

  let stored = parseVector(profile?.ideology_vector);

  if (error) {
    if (!isMissingVectorRpc(error) && !isMissingStanceColumn(error)) {
      console.warn("Baseline ideology RPC failed; writing the stance directly.", error.message);
    }
    const next = applyIdeologyEma(null, stance, 1);
    stored = next.ten;
    const { error: updateError } = await admin
      .from("users")
      .update({
        ideology_vector: formatPgIdeologyVector(next.ten),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { data: refreshed, error: refreshError } = await admin
      .from("users")
      .select("ideology_vector")
      .eq("id", userId)
      .maybeSingle();
    if (refreshError) throw new Error(refreshError.message);
    stored = parseVector(refreshed?.ideology_vector);
    if (stored.length === 0) stored = buildUserVector([...stance]);
  }

  const ten =
    stored.length >= 10
      ? stored.slice(0, 10)
      : buildUserVector([...toSixAxisVector(stored.length > 0 ? stored : stance)]);
  const username =
    (profile as { username?: string | null } | null)?.username?.trim() ||
    `runner-${userId.slice(0, 6)}`;

  await mirrorCandidateIdeology(admin, userId, username, formatPgIdeologyVector(ten));

  revalidatePath("/onboarding");
  revalidatePath("/profile");
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/my-campaign");

  return { ideologyVector: ten };
}
