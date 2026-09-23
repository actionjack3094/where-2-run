"use server";

import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { updateVector } from "@/app/actions/vector";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import {
  axisPositionScore,
  heuristicClassification,
  isPrimaryAxis,
  matchCatalogOcdIds,
  type OcdCatalogEntry,
  type PromptClassification,
} from "@/lib/debates/prompt-classification";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { SIX_AXIS_IDS, type SixAxisId } from "@/lib/ideology/six-axis";
import { clamp01 } from "@/lib/ideology/vector";
import type { ElectionQuestion } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

const promptClassificationSchema = z.object({
  jurisdictional_level: z.enum(["federal", "state", "local"]),
  primary_axis: z.enum(["climate", "healthcare", "immigration", "economy", "social", "safety"]),
  applicable_ocd_ids: z.array(z.string()).max(24),
});

export type IngestAuthoredPromptInput = {
  prompt: string;
  positionLabel: string;
  positionScore?: number;
};

export type IngestAuthoredPromptResult = {
  classification: PromptClassification;
  questionIds: string[];
  electionIds: string[];
  ideologyVector: number[];
};

function hasProviderKey() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY);
}

function missingQuestionBankMessage() {
  return "election_questions is not in the database yet. Apply the question bank migration.";
}

function asOcdIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

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

async function loadOcdCatalog(admin: AdminClient): Promise<OcdCatalogEntry[]> {
  const { data, error } = await admin
    .from("elections")
    .select("id, office_name, ocd_id");

  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as { id: string; office_name: string; ocd_id?: string | null }[])
    .map((row) => ({
      id: row.id,
      ocdId: row.ocd_id?.trim() ?? "",
      officeName: row.office_name,
    }))
    .filter((row) => row.ocdId.length > 0);
}

function catalogPrompt(catalog: OcdCatalogEntry[]) {
  return catalog
    .slice(0, 40)
    .map((row) => `- ${row.ocdId} | ${row.officeName}`)
    .join("\n");
}

function groundClassification(
  text: string,
  catalog: OcdCatalogEntry[],
  object: z.infer<typeof promptClassificationSchema>,
): PromptClassification {
  const grounded = matchCatalogOcdIds(object.applicable_ocd_ids, object.jurisdictional_level, catalog);
  if (grounded.length > 0) {
    return {
      jurisdictional_level: object.jurisdictional_level,
      primary_axis: object.primary_axis,
      applicable_ocd_ids: grounded,
    };
  }

  const fallback = heuristicClassification(text, catalog, object.jurisdictional_level);
  return {
    jurisdictional_level: object.jurisdictional_level,
    primary_axis: isPrimaryAxis(object.primary_axis) ? object.primary_axis : fallback.primary_axis,
    applicable_ocd_ids: fallback.applicable_ocd_ids,
  };
}

export async function classifyPrompt(prompt: string): Promise<PromptClassification> {
  const text = prompt.trim();
  if (text.length < 8) throw new Error("Write a fuller prompt before classifying it.");

  const admin = createAdminClient();
  const catalog = await loadOcdCatalog(admin);
  const fallback = heuristicClassification(text, catalog);
  if (!hasProviderKey() || catalog.length === 0) return fallback;

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: promptClassificationSchema,
      schemaName: "DebatePromptClassification",
      schemaDescription:
        "Jurisdiction, dominant ideological axis, and OCD divisions that legislate a newly authored debate prompt.",
      system: `You classify WHERE 2 RUN debate prompts.
Return jurisdictional_level as federal, state, or local.
Return primary_axis as exactly one of: ${SIX_AXIS_IDS.join(", ")}.
Return applicable_ocd_ids using only OCD-IDs from the catalog. Include every catalog division that would legislate the issue at that level. A parent division such as ocd-division/country:us/state:tx is valid when every matching seat in that state applies. Do not invent ids.`,
      prompt: `PROMPT
${text}

OCD CATALOG
${catalogPrompt(catalog)}`,
      temperature: 0.1,
    });

    return groundClassification(text, catalog, object);
  } catch (error) {
    console.warn("Prompt classification fell back to keyword mapping.", error);
    return fallback;
  }
}

function electionsForClassification(
  catalog: OcdCatalogEntry[],
  classification: PromptClassification,
) {
  const wanted = new Set(classification.applicable_ocd_ids.map((id) => normalizeOcdId(id)));
  return catalog.filter((row) => wanted.has(normalizeOcdId(row.ocdId)));
}

async function bankQuestions(
  admin: AdminClient,
  userId: string,
  prompt: string,
  classification: PromptClassification,
  elections: OcdCatalogEntry[],
) {
  if (elections.length === 0) return [] as Pick<ElectionQuestion, "id" | "election_id">[];

  const electionIds = elections.map((row) => row.id);
  const { data: existing, error: existingError } = await admin
    .from("election_questions")
    .select("id, election_id")
    .eq("prompt", prompt)
    .in("election_id", electionIds);

  if (existingError) {
    if (isMissingRelation(existingError)) throw new Error(missingQuestionBankMessage());
    throw new Error(existingError.message);
  }

  const banked = new Map<string, string>();
  for (const row of (existing ?? []) as Pick<ElectionQuestion, "id" | "election_id">[]) {
    banked.set(row.election_id, row.id);
  }

  const missing = elections.filter((row) => !banked.has(row.id));
  if (missing.length === 0) {
    return [...banked.entries()].map(([election_id, id]) => ({ id, election_id }));
  }

  const { data: inserted, error: insertError } = await admin
    .from("election_questions")
    .insert(
      missing.map((row) => ({
        election_id: row.id,
        author_id: userId,
        prompt,
        jurisdictional_level: classification.jurisdictional_level,
        primary_axis: classification.primary_axis,
        applicable_ocd_ids: classification.applicable_ocd_ids,
        information_gain_score: 1,
      })),
    )
    .select("id, election_id");

  if (insertError) {
    if (isMissingRelation(insertError)) throw new Error(missingQuestionBankMessage());
    throw new Error(insertError.message);
  }

  for (const row of (inserted ?? []) as Pick<ElectionQuestion, "id" | "election_id">[]) {
    banked.set(row.election_id, row.id);
  }

  return [...banked.entries()].map(([election_id, id]) => ({ id, election_id }));
}

async function logStances(
  admin: AdminClient,
  userId: string,
  questions: Pick<ElectionQuestion, "id" | "election_id">[],
  position: { score: number; label: string; axis: SixAxisId },
) {
  if (questions.length === 0) return;

  const { error } = await admin.from("user_stances").upsert(
    questions.map((question) => ({
      user_id: userId,
      question_id: question.id,
      election_id: question.election_id,
      position_score: position.score,
      position_label: position.label,
      primary_axis: position.axis,
    })),
    { onConflict: "user_id,question_id" },
  );

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingQuestionBankMessage());
    throw new Error(error.message);
  }

  for (const question of questions) {
    const { count, error: countError } = await admin
      .from("user_stances")
      .select("id", { count: "exact", head: true })
      .eq("question_id", question.id);

    if (countError) continue;
    const gain = Math.min(1, Math.max(0, 1 / (1 + (count ?? 1))));
    await admin
      .from("election_questions")
      .update({ information_gain_score: Number(gain.toFixed(4)) })
      .eq("id", question.id);
  }
}

export async function ingestAuthoredPrompt(
  input: IngestAuthoredPromptInput,
  accessToken?: string | null,
): Promise<IngestAuthoredPromptResult> {
  const prompt = input.prompt.trim();
  const positionLabel = input.positionLabel.trim();
  if (prompt.length < 8) throw new Error("Write a fuller prompt before publishing it.");
  if (!positionLabel) throw new Error("Choose a position before publishing this prompt.");

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to publish a prompt.");

  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const classification = await classifyPrompt(prompt);
  const catalog = await loadOcdCatalog(admin);
  const elections = electionsForClassification(catalog, classification);
  const questions = await bankQuestions(admin, userId, prompt, classification, elections);

  const positionScore = clamp01(
    input.positionScore == null || !Number.isFinite(input.positionScore)
      ? axisPositionScore(`${prompt}\n${positionLabel}`, classification.primary_axis)
      : input.positionScore,
  );

  await logStances(admin, userId, questions, {
    score: positionScore,
    label: positionLabel.slice(0, 500),
    axis: classification.primary_axis,
  });

  const vector = await updateVector(
    { axisId: classification.primary_axis, score: positionScore },
    accessToken,
  );

  revalidatePath("/feed");

  return {
    classification,
    questionIds: questions.map((row) => row.id),
    electionIds: questions.map((row) => row.election_id),
    ideologyVector: vector.ideologyVector,
  };
}

export async function recordQuestionStance(
  input: {
    questionId: string;
    positionScore: number;
    positionLabel: string;
  },
  accessToken?: string | null,
) {
  if (!isUuid(input.questionId)) throw new Error("A valid question is required.");
  const positionLabel = input.positionLabel.trim();
  if (!positionLabel) throw new Error("Choose a position before recording this stance.");

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to take a stance.");

  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const { data, error } = await admin
    .from("election_questions")
    .select("id, election_id, primary_axis")
    .eq("id", input.questionId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingQuestionBankMessage());
    throw new Error(error.message);
  }
  if (!data) throw new Error("That question is no longer in the bank.");

  const question = data as Pick<ElectionQuestion, "id" | "election_id" | "primary_axis">;
  if (!isPrimaryAxis(question.primary_axis)) {
    throw new Error("That question is missing an ideological axis.");
  }

  const positionScore = clamp01(input.positionScore);
  await logStances(admin, userId, [question], {
    score: positionScore,
    label: positionLabel.slice(0, 500),
    axis: question.primary_axis,
  });

  const vector = await updateVector(
    { axisId: question.primary_axis, score: positionScore },
    accessToken,
  );

  revalidatePath("/feed");
  return { ideologyVector: vector.ideologyVector };
}
