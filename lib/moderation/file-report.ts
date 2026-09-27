import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { arbitrationKindForReport } from "@/lib/moderation/arbitration";
import type { ReportReason, ReportTargetKind } from "@/types/database.types";

const REASONS = new Set<ReportReason>([
  "bad_faith",
  "spam",
  "abandoned",
  "off_platform",
  "other",
]);

type AdminClient = ReturnType<typeof createAdminClient>;

export type FileReportInput = {
  reporterId: string;
  targetKind: ReportTargetKind;
  debateId: string;
  reason: ReportReason;
  argumentId?: string | null;
  voteId?: string | null;
  note?: string | null;
};

function cleanNote(note: string | null | undefined) {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new Error("Keep the note to 500 characters.");
  }
  return trimmed;
}

export async function fileCommunityReport(admin: AdminClient, input: FileReportInput) {
  if (!isUuid(input.reporterId) || !isUuid(input.debateId)) {
    throw new Error("A valid debate and reporter are required.");
  }
  if (!REASONS.has(input.reason)) throw new Error("Choose a report reason.");
  if (input.targetKind === "argument" && !isUuid(input.argumentId ?? "")) {
    throw new Error("Choose the argument to report.");
  }
  if (input.targetKind === "vote" && !isUuid(input.voteId ?? "")) {
    throw new Error("Choose the ballot to report.");
  }
  if (input.targetKind !== "argument" && input.targetKind !== "vote" && input.targetKind !== "debate") {
    throw new Error("Choose what to report.");
  }

  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("id")
    .eq("id", input.debateId)
    .maybeSingle();
  if (debateError) throw new Error(debateError.message);
  if (!debate) throw new Error("Debate not found.");

  const { data: report, error } = await admin
    .from("community_reports")
    .insert({
      reporter_id: input.reporterId,
      target_kind: input.targetKind,
      debate_id: input.debateId,
      reason: input.reason,
      argument_id: input.targetKind === "argument" ? input.argumentId : null,
      vote_id: input.targetKind === "vote" ? input.voteId : null,
      note: cleanNote(input.note),
      status: "open",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") throw new Error("You already reported this.");
    throw new Error(error.message);
  }
  if (!report) throw new Error("Could not file that report.");

  const kind = arbitrationKindForReport({
    targetKind: input.targetKind,
    reason: input.reason,
  });

  if (!kind) return { reportId: report.id, caseId: null as string | null };

  const { data: opened, error: caseError } = await admin
    .from("arbitration_cases")
    .insert({
      debate_id: input.debateId,
      report_id: report.id,
      kind,
      status: "open",
      holds_elo: true,
    })
    .select("id")
    .maybeSingle();

  if (caseError) {
    if (caseError.code !== "23505") throw new Error(caseError.message);
    const { data: existing, error: existingError } = await admin
      .from("arbitration_cases")
      .select("id")
      .eq("debate_id", input.debateId)
      .eq("status", "open")
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    await admin.from("community_reports").update({ status: "queued" }).eq("id", report.id);
    return { reportId: report.id, caseId: existing?.id ?? null };
  }

  await admin.from("community_reports").update({ status: "queued" }).eq("id", report.id);
  return { reportId: report.id, caseId: opened?.id ?? null };
}
