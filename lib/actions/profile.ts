"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { loadCampaignRaces } from "@/lib/actions/campaign";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { publicAvatarUrl } from "@/lib/platform/avatar";
import { displayName, loadProfile, platformAdmin } from "@/lib/platform/records";
import { higherTier, parseTier, type CandidateTierName } from "@/lib/platform/scoring";

export type AvatarResult = {
  error?: string;
  message?: string;
  avatarUrl?: string;
};

export async function updateProfileAvatar(avatarUrl: string): Promise<AvatarResult> {
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to update your photo." };

  const safe = publicAvatarUrl(avatarUrl, userId);
  if (!safe) return { error: "That photo could not be saved." };

  const admin = platformAdmin();
  const { error } = await admin.from("profiles").update({ avatar_url: safe }).eq("id", userId);
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the avatar migration, then reload." };
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/profile/settings");
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/elections");
  revalidatePath("/primaries");
  revalidatePath(`/profile/${userId}`);
  return { message: "Photo saved.", avatarUrl: safe };
}

export type NavIdentity = {
  id: string;
  name: string;
  avatarUrl: string | null;
  tier: CandidateTierName;
};

export async function loadNavIdentity(): Promise<NavIdentity | null> {
  const userId = await requireActionUserId();
  if (!userId) return null;
  const profile = await loadProfile(platformAdmin(), userId);
  let tier = parseTier(profile?.candidate_tier);
  try {
    const races = await loadCampaignRaces(userId);
    for (const race of races) tier = higherTier(tier, race.tier);
  } catch {
    // The profile tier still labels the menu when standings cannot be read.
  }
  return {
    id: userId,
    name: displayName(profile),
    avatarUrl: profile?.avatar_url ?? null,
    tier,
  };
}

export async function updateDisplayName(name: string): Promise<AvatarResult> {
  const userId = await requireActionUserId();
  if (!userId) return { error: "Sign in to update your name." };
  const next = name.trim().replace(/\s+/g, " ");
  if (next.length < 1 || next.length > 48) {
    return { error: "Display name needs 1 to 48 characters." };
  }

  const admin = platformAdmin();
  const { error } = await admin.from("profiles").update({ display_name: next }).eq("id", userId);
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the profile migration, then reload." };
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/ballot");
  revalidatePath("/debates");
  return { message: "Display name saved." };
}
