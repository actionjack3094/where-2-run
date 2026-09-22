"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { parseElo } from "@/lib/arena/elo";
import { isMarginalConfidence, majorityPass } from "@/lib/arena/evaluations";
import {
  checkLocalEligibility,
  juryLockedCopy,
  readElectionOcdId,
} from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  DEFAULT_DISTRICT_BASELINE,
  PASS_AI_SCORE_MIN,
  calculateNewElo,
} from "@/lib/math/elo";
import type { Debate, DebateEvaluation, UserProfile } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Constituent votes required before the jury finalizes the score. */
const JURY_QUORUM = 5;

function missingTableMessage() {
  return "jury_appeals is not in the database yet. Apply the jury appeals migration.";
}

function isMissingColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /ocd_id/i.test(message)
  );
}

function asOcdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function isOpenAppeal(
  row: Pick<DebateEvaluation, "confidence_score" | "status" | "ensemble_result">,
) {
  return (
    isMarginalConfidence(row.confidence_score) &&
    row.status !== "locked" &&
    row.ensemble_result == null
  );
}

async function loadFenceTarget(admin: AdminClient, debate: Debate) {
  const direct = readElectionOcdId(debate.election_id, null);
  if (!debate.election_id || !isUuid(debate.election_id)) {
    return { ocdId: direct, officeName: null as string | null };
  }

  const { data, error } = await admin
    .from("elections")
    .select("ocd_id, office_name")
    .eq("id", debate.election_id)
    .maybeSingle();

  if (error) {
    if (isMissingColumn(error) || isMissingRelation(error)) {
      return { ocdId: direct, officeName: null as string | null };
    }
    throw new Error(error.message);
  }

  const row = data as { ocd_id?: string | null; office_name?: string | null } | null;
  return {
    ocdId: readElectionOcdId(debate.election_id, row?.ocd_id),
    officeName: row?.office_name ?? null,
  };
}

async function finalizeAppeal(
  admin: AdminClient,
  debate: Debate,
  pass: boolean,
) {
  const { data, error } = await admin
    .from("debate_evaluations")
    .select("*")
    .eq("debate_id", debate.id);

  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }

  const open = ((data ?? []) as DebateEvaluation[]).filter(isOpenAppeal);
  const aiScore = pass ? PASS_AI_SCORE_MIN : 0;
  const now = new Date().toISOString();
  const finalized: { candidateId: string; eloRating: number }[] = [];

  for (const evaluation of open) {
    const { data: claimed, error: claimError } = await admin
      .from("debate_evaluations")
      .update({
        ensemble_result: pass,
        status: "locked",
        updated_at: now,
      })
      .eq("id", evaluation.id)
      .in("status", ["evaluated", "appealed"])
      .select("id")
      .maybeSingle();

    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;

    const { data: user, error: userError } = await admin
      .from("users")
      .select("elo_rating")
      .eq("id", evaluation.candidate_id)
      .maybeSingle();
    if (userError) throw new Error(userError.message);

    const nextElo = calculateNewElo(
      parseElo(
        (user as { elo_rating?: number | string | null } | null)?.elo_rating,
      ),
      DEFAULT_DISTRICT_BASELINE,
      aiScore,
    );

    const { error: eloError } = await admin
      .from("users")
      .update({ elo_rating: nextElo, updated_at: now })
      .eq("id", evaluation.candidate_id);
    if (eloError) throw new Error(eloError.message);

    finalized.push({ candidateId: evaluation.candidate_id, eloRating: nextElo });
  }

  const { data: freshRows, error: freshError } = await admin
    .from("debate_evaluations")
    .select("candidate_id, confidence_score, status, ensemble_result")
    .eq("debate_id", debate.id);

  if (freshError) {
    if (!isMissingRelation(freshError)) throw new Error(freshError.message);
    return finalized;
  }

  const fresh = (freshRows ?? []) as Pick<
    DebateEvaluation,
    "candidate_id" | "confidence_score" | "status" | "ensemble_result"
  >[];
  const candidateIds = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );
  const ready =
    candidateIds.length > 0 &&
    candidateIds.every((candidateId) => {
      const evaluation = fresh.find((row) => row.candidate_id === candidateId);
      if (!evaluation) return false;
      if (evaluation.status === "locked") return true;
      return !isMarginalConfidence(evaluation.confidence_score);
    });

  if (ready && (debate.status === "active" || debate.status === "voting")) {
    const { error: closeError } = await admin
      .from("debates")
      .update({
        status: "completed",
        elo_applied_at: debate.elo_applied_at ?? now,
      })
      .eq("id", debate.id)
      .in("status", ["active", "voting"]);
    if (closeError) throw new Error(closeError.message);
  }

  return finalized;
}

export async function castJuryVote(input: {
  debateId: string;
  voteDirection: boolean;
  accessToken?: string | null;
}) {
  const debateId = input.debateId.trim();
  if (!isUuid(debateId)) throw new Error("A valid debate is required.");
  if (typeof input.voteDirection !== "boolean") {
    throw new Error("Choose validate or reject before casting a jury vote.");
  }

  const userId = await requireActionUserId(input.accessToken);
  if (!userId) throw new Error("Sign in to vote on this appeal.");

  const admin = createAdminClient();
  const { data: profileRow, error: profileError } = await admin
    .from("users")
    .select("id, ocd_identifiers")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  const profile = profileRow as Pick<UserProfile, "id" | "ocd_identifiers"> | null;
  if (!profile) throw new Error("Verify your address before sitting on a jury.");

  const { data: debateRow, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);
  const debate = debateRow as Debate | null;
  if (!debate) throw new Error("Debate not found.");

  const fence = await loadFenceTarget(admin, debate);
  const eligible = checkLocalEligibility(asOcdArray(profile.ocd_identifiers), fence.ocdId);
  if (!eligible) {
    throw new Error(juryLockedCopy(fence.officeName, fence.ocdId));
  }

  const { data: evaluationRows, error: evaluationError } = await admin
    .from("debate_evaluations")
    .select("confidence_score, status, ensemble_result")
    .eq("debate_id", debate.id);

  if (evaluationError) {
    if (isMissingRelation(evaluationError)) {
      throw new Error("debate_evaluations is not in the database yet.");
    }
    throw new Error(evaluationError.message);
  }

  const open = (
    (evaluationRows ?? []) as Pick<
      DebateEvaluation,
      "confidence_score" | "status" | "ensemble_result"
    >[]
  ).some(isOpenAppeal);
  if (!open) throw new Error("This appeal is closed.");

  const { error: insertError } = await admin.from("jury_appeals").insert({
    debate_id: debate.id,
    voter_id: userId,
    vote_direction: input.voteDirection,
  });

  if (insertError) {
    if (isMissingRelation(insertError)) throw new Error(missingTableMessage());
    if (insertError.code === "23505") {
      throw new Error("You already cast a jury vote on this appeal.");
    }
    throw new Error(insertError.message);
  }

  const { data: voteRows, error: voteError } = await admin
    .from("jury_appeals")
    .select("vote_direction")
    .eq("debate_id", debate.id);

  if (voteError) {
    if (isMissingRelation(voteError)) throw new Error(missingTableMessage());
    throw new Error(voteError.message);
  }

  const directions = ((voteRows ?? []) as { vote_direction: boolean }[]).map(
    (row) => Boolean(row.vote_direction),
  );
  const voteCount = directions.length;
  const tally = majorityPass(directions);

  if (voteCount < JURY_QUORUM || tally.passCount === tally.failCount) {
    revalidatePath("/feed");
    revalidatePath(`/debates/${debate.id}`);
    return {
      ok: true as const,
      closed: false as const,
      voteCount,
      quorum: JURY_QUORUM,
    };
  }

  const finalized = await finalizeAppeal(admin, debate, tally.pass);

  revalidatePath("/feed");
  revalidatePath(`/debates/${debate.id}`);
  revalidatePath("/leaderboards");
  for (const row of finalized) {
    revalidatePath(`/profile/${row.candidateId}`);
    revalidatePath(`/candidate/${row.candidateId}`);
  }

  return {
    ok: true as const,
    closed: true as const,
    voteCount,
    quorum: JURY_QUORUM,
    pass: tally.pass,
    passCount: tally.passCount,
    failCount: tally.failCount,
    elo: finalized,
  };
}
