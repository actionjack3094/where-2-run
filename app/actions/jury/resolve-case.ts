"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { fileCommunityReport } from "@/lib/moderation/file-report";
import { resolveArbitrationCase } from "@/lib/moderation/resolve-case";
import { meetsVerificationTier } from "@/lib/verification";
import type { JuryDecision } from "@/lib/moderation/arbitration";
import type { ReportReason, ReportTargetKind } from "@/types/database.types";

async function requireJuror(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to sit on the jury.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("verification_tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!meetsVerificationTier(data?.verification_tier, "voter_verified")) {
    throw new Error("Verify your voter registration before sitting on the jury.");
  }

  return { admin, userId };
}

export async function resolveJuryCase(
  input: { caseId: string; decision: JuryDecision; note?: string },
  accessToken?: string | null,
) {
  const { admin, userId } = await requireJuror(accessToken);
  await resolveArbitrationCase(admin, {
    caseId: input.caseId,
    reviewerId: userId,
    decision: input.decision,
    note: input.note,
  });
  revalidatePath("/jury");
}

export async function fileJuryReport(
  input: {
    debateId: string;
    targetKind: ReportTargetKind;
    reason: ReportReason;
    note?: string;
  },
  accessToken?: string | null,
) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to file a report.");
  const admin = createAdminClient();
  await fileCommunityReport(admin, {
    reporterId: userId,
    debateId: input.debateId,
    targetKind: input.targetKind,
    reason: input.reason,
    note: input.note,
  });
  revalidatePath("/jury");
}
