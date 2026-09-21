import type { SupabaseClient } from "@supabase/supabase-js";
import { parseElo, ratingsAfterResult } from "@/lib/arena/elo";
import { isMarginalConfidence } from "@/lib/arena/evaluations";
import { pickDebateWinnerId } from "@/lib/arena/winner";
import { isMissingRelation } from "@/lib/coalitions";
import type { Database, Debate, DebateEvaluation, Vote } from "@/types/database.types";

type AdminClient = SupabaseClient<Database>;

type DebateRow = Pick<
  Debate,
  | "id"
  | "status"
  | "expires_at"
  | "candidate_a_id"
  | "candidate_b_id"
> & {
  elo_applied_at?: string | null;
};

async function writeEloRating(admin: AdminClient, userId: string, eloRating: number) {
  const viewUpdate = await admin
    .from("candidate_stats")
    .update({ elo_rating: eloRating })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (!viewUpdate.error) return;

  const { error } = await admin
    .from("users")
    .update({ elo_rating: eloRating })
    .eq("id", userId);

  if (error) throw error;
}

async function resolveWinnerId(admin: AdminClient, debate: DebateRow) {
  const { data, error } = await admin.rpc("calculate_debate_winner", {
    debate_uuid: debate.id,
  });
  if (!error) return data ?? null;

  const { data: votes } = await admin
    .from("votes")
    .select("candidate_id")
    .eq("debate_id", debate.id);

  return pickDebateWinnerId(debate, (votes ?? []) as Pick<Vote, "candidate_id">[]);
}

export async function applyDebateElo(admin: AdminClient, debateId: string) {
  const { data: debateRow, error: debateError } = await admin
    .from("debates")
    .select("*")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw debateError;
  const debate = debateRow as DebateRow | null;
  if (!debate) return { skipped: "missing_debate" as const };
  if (debate.elo_applied_at) return { skipped: "already_applied" as const };
  if (!debate.candidate_a_id || !debate.candidate_b_id) {
    return { skipped: "open_seat" as const };
  }

  const expired =
    Number.isFinite(Date.parse(debate.expires_at)) &&
    Date.parse(debate.expires_at) <= Date.now();

  if (!expired) {
    const { data: evaluationRows, error: evaluationError } = await admin
      .from("debate_evaluations")
      .select("candidate_id, confidence_score, status, ensemble_result")
      .eq("debate_id", debate.id);

    if (evaluationError && !isMissingRelation(evaluationError)) {
      throw evaluationError;
    }

    const pendingAppeal = (
      (evaluationRows ?? []) as Pick<
        DebateEvaluation,
        "candidate_id" | "confidence_score" | "status" | "ensemble_result"
      >[]
    ).some(
      (row) =>
        isMarginalConfidence(row.confidence_score) &&
        row.status !== "locked" &&
        row.ensemble_result == null,
    );

    if (pendingAppeal) return { skipped: "pending_appeal" as const };
  }

  if (debate.status !== "completed") {
    if (
      !expired ||
      (debate.status !== "active" && debate.status !== "voting")
    ) {
      return { skipped: "not_concluded" as const };
    }

    const { error: closeError } = await admin
      .from("debates")
      .update({ status: "completed" })
      .eq("id", debate.id)
      .in("status", ["active", "voting"]);

    if (closeError) throw closeError;
  }

  const winnerId = await resolveWinnerId(admin, debate);
  const loserId =
    winnerId === debate.candidate_a_id
      ? debate.candidate_b_id
      : winnerId === debate.candidate_b_id
        ? debate.candidate_a_id
        : null;

  if (!winnerId || !loserId) {
    await admin
      .from("debates")
      .update({ elo_applied_at: new Date().toISOString() })
      .eq("id", debate.id)
      .is("elo_applied_at", null);
    return { skipped: "no_winner" as const };
  }

  const { data: statsRows, error: statsError } = await admin
    .from("candidate_stats")
    .select("id, elo_rating")
    .in("id", [winnerId, loserId]);

  if (statsError) throw statsError;

  const eloById = new Map(
    ((statsRows ?? []) as { id: string; elo_rating: number | string | null }[]).map(
      (row) => [row.id, parseElo(row.elo_rating)],
    ),
  );

  const next = ratingsAfterResult(
    eloById.get(winnerId) ?? parseElo(null),
    eloById.get(loserId) ?? parseElo(null),
  );

  await writeEloRating(admin, winnerId, next.winnerElo);
  await writeEloRating(admin, loserId, next.loserElo);

  const { error: stampError } = await admin
    .from("debates")
    .update({ elo_applied_at: new Date().toISOString() })
    .eq("id", debate.id)
    .is("elo_applied_at", null);

  if (stampError) throw stampError;

  return {
    skipped: null,
    winnerId,
    loserId,
    winnerElo: next.winnerElo,
    loserElo: next.loserElo,
    expectedWinner: next.expectedWinner,
    expectedLoser: next.expectedLoser,
  };
}

export async function lockDebateEloAfterArbitration(
  admin: AdminClient,
  debate: Debate,
  evaluations: DebateEvaluation[],
) {
  const candidateIds = [debate.candidate_a_id, debate.candidate_b_id].filter(
    (id): id is string => Boolean(id),
  );
  const ready = candidateIds.every((candidateId) => {
    const evaluation = evaluations.find((row) => row.candidate_id === candidateId);
    if (!evaluation) return false;
    if (evaluation.status === "locked") return true;
    return !isMarginalConfidence(evaluation.confidence_score);
  });
  if (!ready) return { skipped: "pending_appeal" as const };

  if (debate.status === "active" || debate.status === "voting") {
    const { error } = await admin
      .from("debates")
      .update({ status: "completed" })
      .eq("id", debate.id)
      .in("status", ["active", "voting"]);
    if (error) throw error;
  }

  return applyDebateElo(admin, debate.id);
}

export async function settleExpiredDebateElo(
  admin: AdminClient,
  debateId?: string,
) {
  try {
    await admin.rpc("complete_expired_debates");
  } catch (error) {
    console.error("complete_expired_debates failed", error);
  }

  if (!debateId) return { skipped: "no_debate" as const };

  try {
    return await applyDebateElo(admin, debateId);
  } catch (error) {
    console.error("applyDebateElo failed", error);
    return { skipped: "elo_error" as const };
  }
}
