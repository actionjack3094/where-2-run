import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { juryResolutionPlan, type JuryDecision } from "@/lib/moderation/arbitration";
import type { ArbitrationKind } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

const KINDS = new Set<ArbitrationKind>([
  "flagged_vote",
  "bad_faith_argument",
  "abandoned_debate",
]);

export async function resolveArbitrationCase(
  admin: AdminClient,
  input: {
    caseId: string;
    reviewerId: string;
    decision: JuryDecision;
    note?: string | null;
  },
) {
  if (!isUuid(input.caseId) || !isUuid(input.reviewerId)) {
    throw new Error("A valid case is required.");
  }
  if (input.decision !== "uphold" && input.decision !== "dismiss") {
    throw new Error("Choose uphold or dismiss.");
  }

  const note = input.note?.trim() || null;
  if (note && note.length > 500) throw new Error("Keep the note to 500 characters.");

  const { data: row, error } = await admin
    .from("arbitration_cases")
    .select("id, debate_id, report_id, kind, status")
    .eq("id", input.caseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Case not found.");
  if (row.status !== "open") throw new Error("This case is already closed.");
  if (!KINDS.has(row.kind as ArbitrationKind)) throw new Error("Unknown arbitration kind.");

  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("id, status, expires_at, candidate_a_id, candidate_b_id")
    .eq("id", row.debate_id)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);
  if (!debate) throw new Error("Debate not found.");
  if (input.reviewerId === debate.candidate_a_id || input.reviewerId === debate.candidate_b_id) {
    throw new Error("Candidates cannot arbitrate their own floor.");
  }

  const plan = juryResolutionPlan(row.kind as ArbitrationKind, input.decision);
  const now = new Date().toISOString();

  if (plan.voidFlaggedVote && row.report_id) {
    const { data: report, error: reportError } = await admin
      .from("community_reports")
      .select("vote_id")
      .eq("id", row.report_id)
      .maybeSingle();
    if (reportError) throw new Error(reportError.message);
    if (report?.vote_id) {
      const { error: voidError } = await admin
        .from("votes")
        .update({ voided_at: now })
        .eq("id", report.vote_id)
        .is("voided_at", null);
      if (voidError) throw new Error(voidError.message);
    }
  }

  if (plan.debateStatus === "expired") {
    const { error: expireError } = await admin
      .from("debates")
      .update({ status: "expired" })
      .eq("id", debate.id)
      .in("status", ["matching", "active", "voting"]);
    if (expireError) throw new Error(expireError.message);
  }

  const expired = new Date(debate.expires_at).getTime() <= Date.now();
  if (
    input.decision === "dismiss" &&
    expired &&
    (debate.status === "matching" || debate.status === "active")
  ) {
    const { error: closeError } = await admin
      .from("debates")
      .update({ status: "completed", winner_id: null })
      .eq("id", debate.id)
      .in("status", ["matching", "active"]);
    if (closeError) throw new Error(closeError.message);

    const { error: eloError } = await admin.rpc("apply_debate_elo", {
      debate_uuid: debate.id,
    });
    if (eloError) throw new Error(eloError.message);
  }

  const { error: caseError } = await admin
    .from("arbitration_cases")
    .update({
      status: plan.caseStatus,
      holds_elo: plan.holdsElo,
      reviewer_id: input.reviewerId,
      resolution_note: note,
      resolved_at: now,
    })
    .eq("id", row.id)
    .eq("status", "open");

  if (caseError) throw new Error(caseError.message);

  if (row.report_id) {
    await admin
      .from("community_reports")
      .update({ status: plan.caseStatus })
      .eq("id", row.report_id);
  }

  return { caseId: row.id, debateId: debate.id, status: plan.caseStatus };
}
