"use server";

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { parseElo } from "@/lib/arena/elo";
import {
  ADDENDUM_WORD_LIMIT,
  countWords,
  PUBLIC_RUBRIC,
} from "@/lib/arena/evaluations";
import { assembleDebateText, ENSEMBLE_MODELS } from "@/lib/arena/judge";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  calculateNewElo,
  DEFAULT_DISTRICT_BASELINE,
  isMarginalAiScore,
  PASS_AI_SCORE_MIN,
} from "@/lib/math/elo";
import { parseAmount } from "@/lib/pledges";
import {
  customerIdOf,
  dollarsToCents,
  getStripe,
  paymentMethodIdOf,
} from "@/lib/stripe";
import type {
  Argument,
  CampaignPledge,
  Debate,
  DebateEvaluation,
} from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type LanguageModel = Parameters<typeof generateObject>[0]["model"];

const gradeDebateSchema = z.object({
  confidenceScore: z.number().min(0).max(100),
  verdict: z.enum(["Pass", "Fail", "Marginal"]),
  rationale: z.string().min(1),
});

export type GradeDebateObject = z.infer<typeof gradeDebateSchema>;
export type ArbitrationVerdict = GradeDebateObject["verdict"];

export type EnsembleGrade = GradeDebateObject & {
  model: string;
};

export type CaptureHandoff = {
  attempted: number;
  captured: number;
  failed: number;
  skipped: number;
  errors: { pledgeId: string; message: string }[];
};

export type GradeDebateResult = {
  ok: true;
  evaluations: DebateEvaluation[];
  grades: Array<{
    candidateId: string;
    confidenceScore: number;
    verdict: ArbitrationVerdict;
    rationale: string;
    ensemble: EnsembleGrade[];
    clarificationAddendum: string | null;
    eloRating: number | null;
    escrow: CaptureHandoff | null;
  }>;
};

function missingTableMessage() {
  return "debate_evaluations is not in the database yet. Apply the debate evaluations migration.";
}

function languageModelFor(modelId: string): LanguageModel {
  if (modelId.startsWith("claude")) return anthropic(modelId);
  if (modelId.startsWith("gemini")) return google(modelId);
  return openai(modelId);
}

function hasProviderKey(modelId: string) {
  if (process.env.AI_GATEWAY_API_KEY) return true;
  if (modelId.startsWith("claude")) return Boolean(process.env.ANTHROPIC_API_KEY);
  if (modelId.startsWith("gemini")) {
    return Boolean(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
    );
  }
  return Boolean(process.env.OPENAI_API_KEY);
}

function isMissingRpc(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    /could not find the function/i.test(message) ||
    /lock_arbitration_elo/i.test(message)
  );
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function verdictFromScore(score: number): ArbitrationVerdict {
  if (score >= PASS_AI_SCORE_MIN) return "Pass";
  if (isMarginalAiScore(score)) return "Marginal";
  return "Fail";
}

function clampWords(text: string, limit: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, limit).join(" ");
}

function emptyCapture(): CaptureHandoff {
  return { attempted: 0, captured: 0, failed: 0, skipped: 0, errors: [] };
}

function mockEnsembleGrade(model: string, transcript: string): EnsembleGrade {
  const words = countWords(transcript);
  const confidenceScore = clampScore(22 + Math.min(words, 420) / 5.2);
  const verdict = verdictFromScore(confidenceScore);
  return {
    model,
    confidenceScore,
    verdict,
    rationale:
      verdict === "Pass"
        ? "The filing names a local mechanism and stays on the floor question."
        : verdict === "Marginal"
          ? "The argument is on-topic but thin on enforceable district specifics."
          : "The transcript is too thin or off-topic to pass the public rubric.",
  };
}

async function generateEnsembleGrade(
  modelId: string,
  label: string,
  prompt: string,
): Promise<EnsembleGrade> {
  const { object } = await generateObject({
    model: languageModelFor(modelId),
    schema: gradeDebateSchema,
    schemaName: "DebateArbitrationGrade",
    schemaDescription:
      "Structured arbitration grade with confidenceScore 0-100, Pass/Fail/Marginal verdict, and rationale.",
    system:
      "You are one judge on the WHERE 2 RUN AI Arbitration Engine. Score only this candidate's transcript against the public rubric. Do not compare opponents. confidenceScore is 0-100. Pass requires a decisive filing (90+), Marginal is 60-89, Fail is below 60.",
    prompt,
    temperature: 0.2,
  });
  return {
    model: label,
    confidenceScore: clampScore(object.confidenceScore),
    verdict: object.verdict,
    rationale: object.rationale.trim(),
  };
}

async function runEnsembleFanOut(transcript: string): Promise<EnsembleGrade[]> {
  const prompt = `${PUBLIC_RUBRIC}

CANDIDATE TRANSCRIPT
${transcript}

Grade this candidate only. Return confidenceScore (0-100), verdict (Pass, Fail, or Marginal), and a short rationale.`;

  return Promise.all(
    ENSEMBLE_MODELS.map(async (model) => {
      if (!hasProviderKey(model.id)) {
        console.warn(`Arbitration: no key for ${model.label}; using local grade.`);
        return mockEnsembleGrade(model.label, transcript);
      }
      try {
        return await generateEnsembleGrade(model.id, model.label, prompt);
      } catch (error) {
        console.error(`Arbitration ${model.label} failed; using local grade.`, error);
        return mockEnsembleGrade(model.label, transcript);
      }
    }),
  );
}

async function generateClarificationAddendum(input: {
  topic: string;
  transcript: string;
  confidenceScore: number;
  rationale: string;
}) {
  const system = `You write a Clarification Addendum for a WHERE 2 RUN candidate. Output at most ${ADDENDUM_WORD_LIMIT} words. Prompt the candidate for deeper policy specifics: named ordinances, budget lines, taxes, school boards, precincts, or constituent costs. No biography. No new topics. Do not grade them again.`;
  const prompt = `Floor question: ${input.topic}

Averaged arbitration confidence: ${input.confidenceScore.toFixed(1)} (marginal 60–89).

Ensemble rationale:
${input.rationale}

Candidate transcript:
${input.transcript}

Write a strict ${ADDENDUM_WORD_LIMIT}-word Clarification Addendum that tells the candidate exactly which policy specifics to supply.`;

  const fallback = clampWords(
    `Your averaged score is ${input.confidenceScore.toFixed(1)}, inside the 60–89 marginal band. File a ${ADDENDUM_WORD_LIMIT}-word addendum that names the district tool you would actually use: ordinance, budget line, millage, school board vote, or precinct cost. Quote a number, a named body, and who pays. Do not restate slogans from the transcript.`,
    ADDENDUM_WORD_LIMIT,
  );

  if (!hasProviderKey(ENSEMBLE_MODELS[0].id)) {
    return fallback;
  }

  try {
    const { text } = await generateText({
      model: languageModelFor(ENSEMBLE_MODELS[0].id),
      system,
      prompt,
      temperature: 0.3,
      maxOutputTokens: 240,
    });
    const trimmed = clampWords(text, ADDENDUM_WORD_LIMIT);
    return trimmed || fallback;
  } catch (error) {
    console.error("Clarification Addendum generation failed; using template.", error);
    return fallback;
  }
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
    throw new Error("Only the seated candidates can request AI arbitration.");
  }

  return { admin, userId, debate: record };
}

async function loadCandidateTranscript(
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

async function upsertEvaluation(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
  payload: {
    primaryScore: number;
    confidenceScore: number;
    verdict: ArbitrationVerdict;
    addendumText: string | null;
    status: DebateEvaluation["status"];
    ensembleResult: boolean | null;
  },
) {
  const now = new Date().toISOString();
  const confidenceUnit = Math.min(1, Math.max(0, payload.confidenceScore / 100));
  const row = {
    debate_id: debate.id,
    candidate_id: candidateId,
    primary_score: payload.primaryScore,
    confidence_score: confidenceUnit,
    rubric_flag: payload.verdict,
    addendum_text: payload.addendumText,
    ensemble_result: payload.ensembleResult,
    status: payload.status,
    updated_at: now,
  };

  const { data: existing, error: existingError } = await admin
    .from("debate_evaluations")
    .select("id")
    .eq("debate_id", debate.id)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (existingError) {
    if (isMissingRelation(existingError)) throw new Error(missingTableMessage());
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { data: updated, error: updateError } = await admin
      .from("debate_evaluations")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return updated as DebateEvaluation;
  }

  const { data: inserted, error: insertError } = await admin
    .from("debate_evaluations")
    .insert({ ...row, created_at: now })
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

async function lockEloFallback(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
  evaluationId: string,
  aiScore: number,
) {
  const { data: user, error } = await admin
    .from("users")
    .select("id, elo_rating")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  const nextElo = calculateNewElo(
    parseElo(
      (user as { elo_rating?: number | string | null } | null)?.elo_rating,
    ),
    DEFAULT_DISTRICT_BASELINE,
    aiScore,
  );

  const { error: winnerError } = await admin
    .from("users")
    .update({ elo_rating: nextElo, updated_at: now })
    .eq("id", candidateId);
  if (winnerError) throw new Error(winnerError.message);

  if (debate.status === "active" || debate.status === "voting") {
    await admin
      .from("debates")
      .update({
        elo_applied_at: debate.elo_applied_at ?? now,
        status: "completed",
      })
      .eq("id", debate.id);
  } else if (!debate.elo_applied_at) {
    await admin
      .from("debates")
      .update({ elo_applied_at: now })
      .eq("id", debate.id)
      .is("elo_applied_at", null);
  }

  const lockPayload = {
    status: "locked" as const,
    ensemble_result: true,
    elo_rating: nextElo,
    updated_at: now,
  };

  let { data: locked, error: lockError } = await admin
    .from("debate_evaluations")
    .update(lockPayload)
    .eq("id", evaluationId)
    .select("*")
    .single();

  if (lockError && /elo_rating/i.test(lockError.message ?? "")) {
    const { elo_rating: _elo, ...withoutElo } = lockPayload;
    const retry = await admin
      .from("debate_evaluations")
      .update(withoutElo)
      .eq("id", evaluationId)
      .select("*")
      .single();
    locked = retry.data;
    lockError = retry.error;
  }

  if (lockError || !locked) {
    throw new Error(lockError?.message ?? "Could not lock the evaluation.");
  }

  return { evaluation: locked as DebateEvaluation, eloRating: nextElo };
}

async function lockArbitrationElo(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
  evaluation: DebateEvaluation,
) {
  const { data, error } = await admin.rpc("lock_arbitration_elo", {
    p_debate_id: debate.id,
    p_candidate_id: candidateId,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const eloRating =
      row && typeof row === "object" && "elo_rating" in row
        ? Number((row as { elo_rating: number | string | null }).elo_rating)
        : null;

    const { data: locked } = await admin
      .from("debate_evaluations")
      .select("*")
      .eq("id", evaluation.id)
      .maybeSingle();

    return {
      evaluation: (locked as DebateEvaluation | null) ?? evaluation,
      eloRating: Number.isFinite(eloRating) ? eloRating : parseElo(null),
    };
  }

  if (!isMissingRpc(error)) throw new Error(error.message);
  console.warn("lock_arbitration_elo RPC missing; applying ELO in the action.");
  return lockEloFallback(
    admin,
    debate,
    candidateId,
    evaluation.id,
    clampScore(Number(evaluation.primary_score)),
  );
}

type PledgeCaptureRow = Pick<
  CampaignPledge,
  | "id"
  | "amount"
  | "candidate_id"
  | "election_id"
  | "donor_id"
  | "unlock_condition"
  | "stripe_customer_id"
  | "stripe_payment_method_id"
  | "stripe_setup_intent_id"
  | "status"
> & {
  debate_id?: string | null;
};

function pledgeLinkedToDebate(row: PledgeCaptureRow, debate: Debate) {
  if (row.debate_id && row.debate_id === debate.id) return true;
  if (row.debate_id) return false;
  if (row.unlock_condition && row.unlock_condition !== "debate_won") return false;
  if (debate.district_id && row.election_id !== debate.district_id) return false;
  return true;
}

async function loadLinkedPledges(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
): Promise<PledgeCaptureRow[]> {
  const withDebate = await admin
    .from("campaign_pledges")
    .select(
      "id, amount, candidate_id, election_id, donor_id, unlock_condition, stripe_customer_id, stripe_payment_method_id, stripe_setup_intent_id, status, debate_id",
    )
    .eq("candidate_id", candidateId)
    .eq("status", "pending")
    .not("stripe_setup_intent_id", "is", null);

  if (!withDebate.error) {
    return ((withDebate.data ?? []) as PledgeCaptureRow[]).filter((row) =>
      pledgeLinkedToDebate(row, debate),
    );
  }

  if (isMissingRelation(withDebate.error)) return [];

  const withoutDebate = await admin
    .from("campaign_pledges")
    .select(
      "id, amount, candidate_id, election_id, donor_id, unlock_condition, stripe_customer_id, stripe_payment_method_id, stripe_setup_intent_id, status",
    )
    .eq("candidate_id", candidateId)
    .eq("status", "pending")
    .not("stripe_setup_intent_id", "is", null);

  if (withoutDebate.error) {
    if (/unlock_condition|debate_id/i.test(withoutDebate.error.message ?? "")) {
      const minimal = await admin
        .from("campaign_pledges")
        .select(
          "id, amount, candidate_id, election_id, donor_id, stripe_customer_id, stripe_payment_method_id, stripe_setup_intent_id, status",
        )
        .eq("candidate_id", candidateId)
        .eq("status", "pending")
        .not("stripe_setup_intent_id", "is", null);
      if (minimal.error) {
        if (isMissingRelation(minimal.error)) return [];
        throw new Error(minimal.error.message);
      }
      return ((minimal.data ?? []) as PledgeCaptureRow[]).filter((row) =>
        pledgeLinkedToDebate(row, debate),
      );
    }
    throw new Error(withoutDebate.error.message);
  }

  return ((withoutDebate.data ?? []) as PledgeCaptureRow[]).filter((row) =>
    pledgeLinkedToDebate(row, debate),
  );
}

async function captureLinkedSetupIntents(
  admin: AdminClient,
  debate: Debate,
  candidateId: string,
): Promise<CaptureHandoff> {
  const pledges = await loadLinkedPledges(admin, debate, candidateId);
  const result = emptyCapture();
  result.attempted = pledges.length;
  if (pledges.length === 0) return result;

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (error) {
    console.error("Stripe is not configured; skipping SetupIntent capture.", error);
    result.skipped = pledges.length;
    return result;
  }

  for (const pledge of pledges) {
    const setupIntentId = pledge.stripe_setup_intent_id?.trim() ?? "";
    const amountCents = dollarsToCents(parseAmount(pledge.amount));
    if (!setupIntentId || amountCents < 50) {
      result.skipped += 1;
      continue;
    }

    try {
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethodId =
        paymentMethodIdOf(setupIntent.payment_method) ??
        pledge.stripe_payment_method_id?.trim() ??
        "";
      const customerId =
        customerIdOf(setupIntent.customer) ?? pledge.stripe_customer_id?.trim() ?? "";

      if (!paymentMethodId || !customerId) {
        result.skipped += 1;
        continue;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        capture_method: "manual",
        metadata: {
          pledge_id: pledge.id,
          candidate_id: pledge.candidate_id,
          debate_id: debate.id,
          setup_intent_id: setupIntentId,
          donor_id: pledge.donor_id,
          election_id: pledge.election_id,
        },
      });

      if (paymentIntent.status === "requires_capture") {
        await stripe.paymentIntents.capture(paymentIntent.id);
      } else if (paymentIntent.status !== "succeeded") {
        throw new Error(
          `SetupIntent ${setupIntentId} produced PaymentIntent status ${paymentIntent.status}.`,
        );
      }

      const { error: updateError } = await admin
        .from("campaign_pledges")
        .update({
          status: "captured",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pledge.id)
        .eq("status", "pending");

      if (updateError) throw new Error(updateError.message);
      result.captured += 1;
    } catch (caught) {
      result.failed += 1;
      const message =
        caught instanceof Error ? caught.message : "Off-session capture failed.";
      result.errors.push({ pledgeId: pledge.id, message });
      await admin
        .from("campaign_pledges")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pledge.id)
        .eq("status", "pending");
    }
  }

  return result;
}

async function gradeCandidate(
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

  const current = existing as DebateEvaluation | null;
  if (current?.status === "locked") {
    return {
      evaluation: current,
      confidenceScore: clampScore(Number(current.primary_score)),
      verdict: (current.ensemble_result ? "Pass" : "Fail") as ArbitrationVerdict,
      rationale: "This verdict is already locked.",
      ensemble: [] as EnsembleGrade[],
      clarificationAddendum: current.addendum_text,
      eloRating: current.elo_rating ?? null,
      escrow: null as CaptureHandoff | null,
    };
  }

  const transcript = await loadCandidateTranscript(admin, debate, candidateId);
  const ensemble = await runEnsembleFanOut(transcript);
  const confidenceScore = clampScore(
    ensemble.reduce((sum, grade) => sum + grade.confidenceScore, 0) /
      Math.max(ensemble.length, 1),
  );
  const verdict = verdictFromScore(confidenceScore);
  const rationale = ensemble
    .map((grade) => `${grade.model}: ${grade.rationale}`)
    .join(" ");

  let clarificationAddendum: string | null = null;
  if (isMarginalAiScore(confidenceScore)) {
    clarificationAddendum = await generateClarificationAddendum({
      topic: debate.topic,
      transcript,
      confidenceScore,
      rationale,
    });
  }

  let evaluation = await upsertEvaluation(admin, debate, candidateId, {
    primaryScore: confidenceScore,
    confidenceScore,
    verdict,
    addendumText: clarificationAddendum,
    status: verdict === "Fail" ? "locked" : "evaluated",
    ensembleResult: verdict === "Pass" ? true : verdict === "Fail" ? false : null,
  });

  let eloRating: number | null = null;
  let escrow: CaptureHandoff | null = null;

  if (verdict === "Pass") {
    const locked = await lockArbitrationElo(admin, debate, candidateId, evaluation);
    evaluation = locked.evaluation;
    eloRating = locked.eloRating;
    escrow = await captureLinkedSetupIntents(admin, debate, candidateId);
  }

  return {
    evaluation,
    confidenceScore,
    verdict,
    rationale,
    ensemble,
    clarificationAddendum,
    eloRating,
    escrow,
  };
}

export async function gradeDebate(
  debateId: string,
  accessToken?: string | null,
): Promise<GradeDebateResult> {
  const { admin, debate } = await requireSeatedCandidate(debateId, accessToken);
  const candidateIds = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );

  const grades = [];
  for (const candidateId of candidateIds) {
    grades.push(await gradeCandidate(admin, debate, candidateId));
  }

  revalidatePath(`/debates/${debate.id}`);
  revalidatePath("/leaderboards");
  revalidatePath("/elections/[districtId]/profile", "page");
  revalidatePath("/my-campaign");
  for (const candidateId of candidateIds) {
    revalidatePath(`/profile/${candidateId}`);
    revalidatePath(`/candidate/${candidateId}`);
  }

  return {
    ok: true,
    evaluations: grades.map((grade) => grade.evaluation),
    grades: grades.map((grade) => ({
      candidateId: grade.evaluation.candidate_id,
      confidenceScore: grade.confidenceScore,
      verdict: grade.verdict,
      rationale: grade.rationale,
      ensemble: grade.ensemble,
      clarificationAddendum: grade.clarificationAddendum,
      eloRating: grade.eloRating,
      escrow: grade.escrow,
    })),
  };
}
