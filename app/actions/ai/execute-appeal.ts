"use server";

import { revalidatePath } from "next/cache";
import { lockDebateEloAfterArbitration } from "@/lib/arena/apply-elo";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import {
  ADDENDUM_WORD_LIMIT,
  canFileAddendum,
  countWords,
} from "@/lib/arena/evaluations";
import { assembleDebateText, runEnsembleCourt } from "@/lib/arena/judge";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import type { Argument, Debate, DebateEvaluation } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

function missingTableMessage() {
  return "debate_evaluations is not in the database yet. Apply the debate evaluations migration.";
}

async function loadDebateText(
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

export async function executeAppeal(input: {
  evaluationId: string;
  addendumText: string;
  accessToken?: string | null;
}) {
  const evaluationId = input.evaluationId.trim();
  const addendumText = input.addendumText.trim();

  if (!isUuid(evaluationId)) throw new Error("A valid evaluation is required.");
  if (!addendumText) throw new Error("Write an addendum before submitting it to the court.");

  const wordCount = countWords(addendumText);
  if (wordCount > ADDENDUM_WORD_LIMIT) {
    throw new Error(`Addenda are capped at ${ADDENDUM_WORD_LIMIT} words.`);
  }

  const userId = await requireActionUserId(input.accessToken);
  if (!userId) throw new Error("Sign in to file an addendum.");

  const admin = createAdminClient();
  const { data: evaluationRow, error: evaluationError } = await admin
    .from("debate_evaluations")
    .select("*")
    .eq("id", evaluationId)
    .maybeSingle();

  if (evaluationError) {
    if (isMissingRelation(evaluationError)) throw new Error(missingTableMessage());
    throw new Error(evaluationError.message);
  }

  const evaluation = evaluationRow as DebateEvaluation | null;
  if (!evaluation) throw new Error("Evaluation not found.");
  if (evaluation.candidate_id !== userId) {
    throw new Error("Only the scored candidate can file this addendum.");
  }
  if (evaluation.status === "locked" || evaluation.ensemble_result != null) {
    throw new Error("This verdict is locked. ELO is already sealed.");
  }
  if (!canFileAddendum(evaluation)) {
    throw new Error("The Ensemble Court only hears marginal confidence scores (0.60–0.89).");
  }

  const { data: debateRow, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", evaluation.debate_id)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);
  const debate = debateRow as Debate | null;
  if (!debate) throw new Error("Debate not found.");

  const now = new Date().toISOString();
  const { error: claimError } = await admin
    .from("debate_evaluations")
    .update({
      addendum_text: addendumText,
      status: "appealed",
      updated_at: now,
    })
    .eq("id", evaluation.id)
    .in("status", ["evaluated", "appealed"]);

  if (claimError) {
    if (isMissingRelation(claimError)) throw new Error(missingTableMessage());
    throw new Error(claimError.message);
  }

  const debateText = await loadDebateText(admin, debate, evaluation.candidate_id);
  const court = await runEnsembleCourt({
    topic: debate.topic,
    debateText,
    rubricFlag: evaluation.rubric_flag ?? "positional_consistency",
    addendumText,
  });

  const lockedAt = new Date().toISOString();
  const { data: lockedRow, error: lockError } = await admin
    .from("debate_evaluations")
    .update({
      addendum_text: addendumText,
      ensemble_result: court.pass,
      status: "locked",
      updated_at: lockedAt,
    })
    .eq("id", evaluation.id)
    .select("*")
    .single();

  if (lockError) throw new Error(lockError.message);
  const locked = lockedRow as DebateEvaluation;

  const { data: siblingRows } = await admin
    .from("debate_evaluations")
    .select("*")
    .eq("debate_id", debate.id);

  const elo = await lockDebateEloAfterArbitration(
    admin,
    debate,
    (siblingRows ?? [locked]) as DebateEvaluation[],
  );

  revalidatePath(`/arena/${debate.id}`);
  revalidatePath("/leaderboards");
  revalidatePath(`/profile/${evaluation.candidate_id}`);

  return {
    ok: true as const,
    evaluation: locked,
    votes: court.votes,
    tally: court.tally,
    majority: court.pass,
    elo,
  };
}
