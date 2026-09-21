"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { assembleDebateText, runPrimaryJudge } from "@/lib/arena/judge";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import type { Argument, Debate, DebateEvaluation } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

function missingTableMessage() {
  return "debate_evaluations is not in the database yet. Apply the debate evaluations migration.";
}

async function requireSeatedCandidate(
  debateId: string,
  accessToken?: string | null,
) {
  if (!isUuid(debateId)) throw new Error("A valid debate is required.");

  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to request arbitration.");

  const admin = createAdminClient();
  const { data: debate, error } = await admin
    .from("debates")
    .select("*")
    .eq("id", debateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!debate) throw new Error("Debate not found.");

  const record = debate as Debate;
  const seated =
    userId === record.candidate_a_id || userId === record.candidate_b_id;
  if (!seated) {
    throw new Error("Only the seated candidates can request a Primary Judge verdict.");
  }

  return { admin, userId, debate: record };
}

async function loadCandidateText(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
) {
  const { data, error } = await admin
    .from("arguments")
    .select("round_number, content")
    .eq("debate_id", debate.id)
    .eq("author_id", candidateId)
    .order("round_number");

  if (error) throw new Error(error.message);
  return assembleDebateText(
    debate.topic,
    (data ?? []) as Pick<Argument, "round_number" | "content">[],
  );
}

async function evaluateCandidate(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
) {
  const { data: existing, error: existingError } = await admin
    .from("debate_evaluations")
    .select("*")
    .eq("debate_id", debate.id)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelation(existingError)) throw new Error(missingTableMessage());
    throw new Error(existingError.message);
  }
  if (existing) return existing as DebateEvaluation;

  const debateText = await loadCandidateText(admin, debate, candidateId);
  const verdict = await runPrimaryJudge({ topic: debate.topic, debateText });
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await admin
    .from("debate_evaluations")
    .insert({
      debate_id: debate.id,
      candidate_id: candidateId,
      primary_score: verdict.score,
      confidence_score: verdict.confidence_score,
      rubric_flag: verdict.rubric_flag,
      addendum_text: null,
      ensemble_result: null,
      status: "evaluated",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError) {
    if (isMissingRelation(insertError)) throw new Error(missingTableMessage());
    if (insertError.code === "23505") {
      const { data: raced } = await admin
        .from("debate_evaluations")
        .select("*")
        .eq("debate_id", debate.id)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (raced) return raced as DebateEvaluation;
    }
    throw new Error(insertError.message);
  }

  return inserted as DebateEvaluation;
}

export async function evaluateDebate(
  debateId: string,
  accessToken?: string | null,
) {
  const { admin, debate } = await requireSeatedCandidate(debateId, accessToken);
  const candidateIds = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );

  const evaluations = [];
  for (const candidateId of candidateIds) {
    evaluations.push(await evaluateCandidate(admin, debate, candidateId));
  }

  revalidatePath(`/arena/${debate.id}`);
  return { ok: true as const, evaluations };
}
