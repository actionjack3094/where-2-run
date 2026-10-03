"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { publicAvatarUrl } from "@/lib/platform/avatar";
import { platformAdmin } from "@/lib/platform/records";

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

  revalidatePath("/profile/settings");
  revalidatePath("/ballot");
  revalidatePath("/debates");
  revalidatePath("/elections");
  revalidatePath("/primaries");
  revalidatePath(`/profile/${userId}`);
  return { message: "Photo saved.", avatarUrl: safe };
}
