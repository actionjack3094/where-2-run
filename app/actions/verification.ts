"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  isMissingVerificationColumn,
  nextVerificationTier,
  parseVerificationTier,
  type VerificationTier,
} from "@/lib/verification";
import type { UserProfile } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id, verification_tier, is_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingVerificationColumn(error)) {
      throw new Error(
        "verification_tier is not on profiles yet. Apply the identity verification migration.",
      );
    }
    throw new Error(error.message);
  }

  if (existing) return existing as Pick<UserProfile, "id" | "verification_tier" | "is_verified">;

  const username = `runner-${userId.slice(0, 6)}`;
  const { data: created, error: insertError } = await admin
    .from("users")
    .insert({
      id: userId,
      username,
      verification_tier: "unverified",
    })
    .select("id, verification_tier, is_verified")
    .maybeSingle();

  if (insertError) {
    if (isMissingVerificationColumn(insertError)) {
      throw new Error(
        "verification_tier is not on profiles yet. Apply the identity verification migration.",
      );
    }
    throw new Error(insertError.message);
  }
  if (!created) throw new Error("Could not open a campaign profile.");
  return created as Pick<UserProfile, "id" | "verification_tier" | "is_verified">;
}

async function requireProfile(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to manage verification.");
  const admin = createAdminClient();
  const profile = await ensurePublicUser(admin, userId);
  return { admin, userId, profile };
}

function revalidateVerificationPaths(userId: string) {
  revalidatePath("/my-campaign/verify");
  revalidatePath("/my-campaign");
  revalidatePath("/feed");
  revalidatePath("/leaderboards");
  revalidatePath(`/profile/${userId}`);
}

export async function loadMyVerification(accessToken?: string | null) {
  const { userId, profile } = await requireProfile(accessToken);
  return {
    ok: true as const,
    userId,
    verificationTier: parseVerificationTier(profile.verification_tier),
  };
}

export async function simulateVerificationUpgrade(
  nextTier: VerificationTier,
  accessToken?: string | null,
) {
  if (nextTier === "unverified") {
    throw new Error("Use the verification hub to climb the identity ladder.");
  }

  const { admin, userId, profile } = await requireProfile(accessToken);
  const current = parseVerificationTier(profile.verification_tier);
  const expected = nextVerificationTier(current);

  if (!expected) {
    throw new Error("This campaign is already at the highest verification tier.");
  }
  if (nextTier !== expected) {
    throw new Error(`Complete ${expected.replaceAll("_", " ")} before this step.`);
  }

  const { error } = await admin
    .from("users")
    .update({
      verification_tier: nextTier,
      is_verified: nextTier === "voter_verified" || nextTier === "candidate_verified",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    if (isMissingVerificationColumn(error)) {
      throw new Error(
        "verification_tier is not on profiles yet. Apply the identity verification migration.",
      );
    }
    throw new Error(error.message);
  }

  revalidateVerificationPaths(userId);
  return { ok: true as const, verificationTier: nextTier };
}
