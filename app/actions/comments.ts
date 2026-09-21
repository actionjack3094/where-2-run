"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { COMMENT_MAX_LENGTH } from "@/lib/comments";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function createComment(
  debateId: string,
  body: string,
  accessToken?: string | null,
) {
  const trimmedDebateId = debateId.trim();
  const trimmedBody = body.trim();

  if (!isUuid(trimmedDebateId)) {
    throw new Error("A valid debate is required.");
  }
  if (!trimmedBody) {
    throw new Error("Write a comment before posting.");
  }
  if (trimmedBody.length > COMMENT_MAX_LENGTH) {
    throw new Error(`Comments are capped at ${COMMENT_MAX_LENGTH} characters.`);
  }

  const userId = await requireActionUserId(accessToken);
  if (!userId) {
    throw new Error("Sign in to post a public comment.");
  }

  const admin = createAdminClient();

  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("id")
    .eq("id", trimmedDebateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);
  if (!debate) throw new Error("Debate not found.");

  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    const username = `runner-${userId.slice(0, 6)}`;
    const { error: profileError } = await admin.from("users").insert({
      id: userId,
      username,
    });
    if (profileError) throw new Error(profileError.message);
  }

  const { error } = await admin.from("comments").insert({
    debate_id: trimmedDebateId,
    author_id: userId,
    body: trimmedBody,
    ai_stance_score: null,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/arena/${trimmedDebateId}`);
  return { ok: true as const };
}
