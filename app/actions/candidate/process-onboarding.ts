"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  BIO_MAX,
  CORE_POLICY_PROMPTS,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  OFFICE_OPTIONS,
  STATE_MAX,
  parseQuizToIdeologyVector,
} from "@/lib/ideology/onboarding";
import { formatPgIdeologyVector } from "@/lib/ideology/vector";

type AdminClient = ReturnType<typeof createAdminClient>;

const officeSchema = z.enum(OFFICE_OPTIONS);

const quizSchema = z
  .record(z.string(), z.number())
  .refine(
    (quiz) => CORE_POLICY_PROMPTS.every((prompt) => Number.isFinite(quiz[prompt.id])),
    "Answer every policy prompt before filing your ticket.",
  );

const onboardingSchema = z.object({
  identity: z.object({
    displayName: z
      .string()
      .trim()
      .min(DISPLAY_NAME_MIN, "Enter a campaign name.")
      .max(DISPLAY_NAME_MAX, `Keep the campaign name under ${DISPLAY_NAME_MAX} characters.`),
    officeSought: officeSchema,
    bio: z
      .string()
      .trim()
      .max(BIO_MAX, `Keep the statement under ${BIO_MAX} characters.`)
      .optional()
      .or(z.literal("")),
    state: z
      .string()
      .trim()
      .max(STATE_MAX, `Keep the state under ${STATE_MAX} characters.`)
      .optional()
      .or(z.literal("")),
  }),
  quiz: quizSchema,
  pacAgreementAccepted: z
    .boolean()
    .refine((value) => value === true, "Accept the Conduit PAC agreement to file."),
});

export type ProcessOnboardingInput = z.input<typeof onboardingSchema>;

function isMissingCandidatesTable(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table/i.test(message) ||
    /relation .*candidates/i.test(message) ||
    (/does not exist/i.test(message) && /candidates/i.test(message))
  );
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

function fallbackUsername(userId: string) {
  return `runner-${userId.slice(0, 6)}`;
}

async function ensurePublicUser(
  admin: AdminClient,
  userId: string,
  username: string,
  ideologyVector: string,
) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const payload = {
    username,
    ideology_vector: ideologyVector,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateError } = await admin
      .from("users")
      .update(payload)
      .eq("id", userId);
    if (updateError) {
      if (isUniqueViolation(updateError)) {
        const { error: retryError } = await admin
          .from("users")
          .update({
            ...payload,
            username: `${username}-${userId.slice(0, 4)}`,
          })
          .eq("id", userId);
        if (retryError) throw new Error(retryError.message);
        return;
      }
      throw new Error(updateError.message);
    }
    return;
  }

  const { error: insertError } = await admin.from("users").insert({
    id: userId,
    ...payload,
  });

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      const { error: retryError } = await admin.from("users").insert({
        id: userId,
        ...payload,
        username: `${username}-${userId.slice(0, 4)}`,
      });
      if (retryError) throw new Error(retryError.message);
      return;
    }
    throw new Error(insertError.message);
  }
}

export async function processOnboarding(
  input: ProcessOnboardingInput,
  accessToken?: string | null,
) {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Could not file this ticket.");
  }

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to file a candidate ticket.");

  const ideologyVector = parseQuizToIdeologyVector(parsed.data.quiz);
  const ideologyVectorPg = formatPgIdeologyVector(ideologyVector);
  const username = parsed.data.identity.displayName || fallbackUsername(userId);
  const now = new Date().toISOString();
  const admin = createAdminClient();

  await ensurePublicUser(admin, userId, username, ideologyVectorPg);

  const candidateRow = {
    id: userId,
    display_name: parsed.data.identity.displayName,
    office_sought: parsed.data.identity.officeSought,
    bio: parsed.data.identity.bio?.trim() || null,
    residency_state: parsed.data.identity.state?.trim() || null,
    ideology_vector: ideologyVectorPg,
    pac_agreement_accepted: true,
    pac_agreement_accepted_at: now,
    updated_at: now,
  };

  const inserted = await admin
    .from("candidates")
    .insert(candidateRow)
    .select("id")
    .maybeSingle();

  let candidateId = inserted.data?.id ?? null;

  if (inserted.error) {
    if (isMissingCandidatesTable(inserted.error)) {
      throw new Error(
        "candidates.ideology_vector is not on the database yet. Apply the candidate onboarding migration.",
      );
    }

    if (isUniqueViolation(inserted.error)) {
      const updated = await admin
        .from("candidates")
        .update(candidateRow)
        .eq("id", userId)
        .select("id")
        .maybeSingle();

      if (updated.error) throw new Error(updated.error.message);
      candidateId = updated.data?.id ?? userId;
    } else {
      throw new Error(inserted.error.message);
    }
  }

  const id = candidateId ?? userId;
  revalidatePath("/onboarding");
  revalidatePath(`/candidate/${id}`);
  revalidatePath("/leaderboards");
  redirect(`/candidate/${id}`);
}
