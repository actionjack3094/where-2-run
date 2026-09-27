import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { fileCommunityReport } from "@/lib/moderation/file-report";
import type { ReportReason, ReportTargetKind } from "@/types/database.types";

export async function POST(request: Request) {
  try {
    const reporterId = await requireAuthenticatedUserId(request);
    if (!reporterId) {
      return NextResponse.json({ error: "Sign in to file a report." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      targetKind?: ReportTargetKind;
      debateId?: string;
      reason?: ReportReason;
      argumentId?: string | null;
      voteId?: string | null;
      note?: string | null;
    } | null;

    if (!body?.targetKind || !body.debateId || !body.reason) {
      return NextResponse.json({ error: "A debate, target, and reason are required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await fileCommunityReport(admin, {
      reporterId,
      targetKind: body.targetKind,
      debateId: body.debateId,
      reason: body.reason,
      argumentId: body.argumentId,
      voteId: body.voteId,
      note: body.note,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not file that report.";
    const status = /already reported/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
