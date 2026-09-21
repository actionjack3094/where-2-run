"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { buildStanceVector, isMissingStanceColumn } from "@/lib/ideology/stance";
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
      stance_vector: stanceVector,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    if (isMissingStanceColumn(error)) {
      throw new Error(
        "stance_vector is not on profiles yet. Apply the stance vector migration.",
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/my-campaign");
  revalidatePath("/onboarding/ideology");
  revalidatePath(`/profile/${userId}`);
  redirect("/my-campaign");
}
