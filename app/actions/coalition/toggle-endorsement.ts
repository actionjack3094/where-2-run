"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existing) return;

  const { error: insertError } = await admin.from("users").insert({
    id: userId,
    username: `runner-${userId.slice(0, 6)}`,
  });
  if (insertError) throw new Error(insertError.message);
}

export async function toggleEndorsement(
  targetId: string,
  accessToken?: string | null,
) {
  const endorsedId = targetId.trim();
  if (!isUuid(endorsedId)) {
    throw new Error("A valid candidate is required.");
  }

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to endorse a campaign.");
  if (userId === endorsedId) {
    throw new Error("You cannot endorse your own campaign.");
  }

  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const { data: target, error: targetError } = await admin
    .from("users")
    .select("id")
    .eq("id", endorsedId)
    .maybeSingle();

  if (targetError) throw new Error(targetError.message);
  if (!target) throw new Error("That candidate is not on a ticket yet.");

  const { data: existing, error: existingError } = await admin
    .from("coalition_endorsements")
    .select("id")
    .eq("endorser_id", userId)
    .eq("endorsed_id", endorsedId)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelation(existingError)) {
      throw new Error(
        "Endorsements are not on the database yet. Apply the coalition endorsements migration.",
      );
    }
    throw new Error(existingError.message);
  }

  if (existing) {
    const { error: deleteError } = await admin
      .from("coalition_endorsements")
      .delete()
      .eq("endorser_id", userId)
      .eq("endorsed_id", endorsedId);

    if (deleteError) throw new Error(deleteError.message);
    revalidateEndorsementPaths(userId, endorsedId);
    return { ok: true as const, endorsed: false, targetId: endorsedId };
  }

  const { error: insertError } = await admin.from("coalition_endorsements").insert({
    endorser_id: userId,
    endorsed_id: endorsedId,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      revalidateEndorsementPaths(userId, endorsedId);
      return { ok: true as const, endorsed: true, targetId: endorsedId };
    }
    if (isMissingRelation(insertError)) {
      throw new Error(
        "Endorsements are not on the database yet. Apply the coalition endorsements migration.",
      );
    }
    throw new Error(insertError.message);
  }

  revalidateEndorsementPaths(userId, endorsedId);
  return { ok: true as const, endorsed: true, targetId: endorsedId };
}

function revalidateEndorsementPaths(endorserId: string, endorsedId: string) {
  revalidatePath("/profile");
  revalidatePath(`/profile/${endorserId}`);
  revalidatePath(`/profile/${endorsedId}`);
  revalidatePath("/my-campaign");
}
