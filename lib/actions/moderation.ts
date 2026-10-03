"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import {
  cleanReportReason,
  isPlatformAdmin,
  reportedStance,
  type PendingFlag,
} from "@/lib/platform/moderation";
import { displayName, loadArenaById, loadProfile, platformAdmin } from "@/lib/platform/records";

export type ModerationResult = {
  error?: string;
  message?: string;
};

function refreshArena() {
  revalidatePath("/admin/moderation");
  revalidatePath("/debates");
  revalidatePath("/ballot");
  revalidatePath("/elections");
  revalidatePath("/primaries");
}

async function requireModerator() {
  const user = await getServerUser();
  if (!user?.id) return { error: "Sign in to continue.", admin: null };
  const admin = platformAdmin();
  const profile = await loadProfile(admin, user.id);
  if (!isPlatformAdmin(user.email, profile?.is_admin === true)) {
    return { error: "This page is limited to platform admins.", admin: null };
  }
  return { error: null, admin };
}

export async function loadModerationQueue(): Promise<
  | { allowed: false; signedOut: boolean; message: string }
  | { allowed: true; flags: PendingFlag[] }
> {
  const user = await getServerUser();
  if (!user?.id) {
    return { allowed: false, signedOut: true, message: "Sign in to review reports." };
  }
  const admin = platformAdmin();
  const profile = await loadProfile(admin, user.id);
  if (!isPlatformAdmin(user.email, profile?.is_admin === true)) {
    return { allowed: false, signedOut: false, message: "This page is limited to platform admins." };
  }

  const { data, error } = await admin
    .from("flagged_content")
    .select("id, debate_id, offender_id, reason, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    debate_id: string;
    offender_id: string;
    reason: string;
    created_at: string;
  }[];
  const debateIds = [...new Set(rows.map((row) => row.debate_id))];
  const offenderIds = [...new Set(rows.map((row) => row.offender_id))];

  const debates = new Map<
    string,
    {
      candidate_a_id: string;
      candidate_b_id: string | null;
      stance_a: string;
      stance_b: string | null;
    }
  >();
  if (debateIds.length > 0) {
    const debateResult = await admin
      .from("arena_debates")
      .select("id, candidate_a_id, candidate_b_id, stance_a, stance_b")
      .in("id", debateIds);
    if (debateResult.error) throw new Error(debateResult.error.message);
    for (const debate of (debateResult.data ?? []) as {
      id: string;
      candidate_a_id: string;
      candidate_b_id: string | null;
      stance_a: string;
      stance_b: string | null;
    }[]) {
      debates.set(debate.id, debate);
    }
  }

  const offenders = new Map<string, { name: string; email: string | null }>();
  if (offenderIds.length > 0) {
    const profileResult = await admin
      .from("profiles")
      .select("id, email, display_name, full_name, legal_name")
      .in("id", offenderIds);
    if (profileResult.error) throw new Error(profileResult.error.message);
    for (const row of (profileResult.data ?? []) as {
      id: string;
      email: string | null;
      display_name: string | null;
      full_name: string | null;
      legal_name: string | null;
    }[]) {
      offenders.set(row.id, {
        name: row.legal_name?.trim() || displayName(row),
        email: row.email,
      });
    }
  }

  const flags = rows.map((row) => {
    const debate = debates.get(row.debate_id);
    const offender = offenders.get(row.offender_id);
    return {
      id: row.id,
      reason: row.reason,
      createdAt: row.created_at,
      debateId: row.debate_id,
      stance: debate ? (reportedStance(debate, row.offender_id) ?? "Stance unavailable.") : "Debate no longer on the board.",
      offenderId: row.offender_id,
      offenderName: offender?.name ?? "Contender",
      offenderEmail: offender?.email ?? null,
    } satisfies PendingFlag;
  });

  return { allowed: true, flags };
}

export async function reportDebate(
  debateId: string,
  offenderId: string,
  reasonText: string,
): Promise<ModerationResult> {
  const reporterId = await requireActionUserId();
  if (!reporterId) return { error: "Sign in to report a debate." };
  if (!isUuid(debateId) || !isUuid(offenderId)) return { error: "That debate is not on the board." };
  if (reporterId === offenderId) return { error: "You cannot report your own stance." };

  const reason = cleanReportReason(reasonText);
  if (!reason) return { error: "Add a short reason for the report." };

  const admin = platformAdmin();
  const debate = await loadArenaById(admin, debateId);
  if (!debate) return { error: "That debate is not on the board." };
  if (reportedStance(debate, offenderId) == null) {
    return { error: "That account is not part of this debate." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("flagged_content").insert({
    reporter_id: reporterId,
    debate_id: debateId,
    offender_id: offenderId,
    reason,
    status: "pending",
  });
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the civic moderation migration, then reload." };
    return { error: error.message };
  }

  revalidatePath("/admin/moderation");
  return { message: "Report filed." };
}

export async function dismissFlag(flagId: string): Promise<ModerationResult> {
  if (!isUuid(flagId)) return { error: "That report is already closed." };
  const gate = await requireModerator();
  if (!gate.admin) return { error: gate.error ?? "This page is limited to platform admins." };

  const { data, error } = await gate.admin
    .from("flagged_content")
    .update({ status: "dismissed" })
    .eq("id", flagId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return { error: "Apply the civic moderation migration, then reload." };
    return { error: error.message };
  }
  if (!data) return { error: "That report is already closed." };

  revalidatePath("/admin/moderation");
  return { message: "Report dismissed." };
}

export async function banUser(flagId: string, offenderId: string): Promise<ModerationResult> {
  if (!isUuid(flagId) || !isUuid(offenderId)) return { error: "That report is already closed." };
  const gate = await requireModerator();
  if (!gate.admin) return { error: gate.error ?? "This page is limited to platform admins." };

  const flag = await gate.admin
    .from("flagged_content")
    .select("id, offender_id, status")
    .eq("id", flagId)
    .maybeSingle();
  if (flag.error) return { error: flag.error.message };
  const row = flag.data as { id: string; offender_id: string; status: string } | null;
  if (!row || row.status !== "pending") return { error: "That report is already closed." };
  if (row.offender_id !== offenderId) return { error: "That report does not match this account." };

  const now = new Date().toISOString();
  const banned = await gate.admin.from("profiles").update({ is_banned: true }).eq("id", offenderId);
  if (banned.error) return { error: banned.error.message };

  const cancelPatch = { status: "cancelled" as const, updated_at: now };
  const opened = await gate.admin
    .from("arena_debates")
    .update(cancelPatch)
    .eq("candidate_a_id", offenderId)
    .in("status", ["open_challenge", "active"]);
  if (opened.error) return { error: opened.error.message };
  const challenged = await gate.admin
    .from("arena_debates")
    .update(cancelPatch)
    .eq("candidate_b_id", offenderId)
    .in("status", ["open_challenge", "active"]);
  if (challenged.error) return { error: challenged.error.message };

  const closed = await gate.admin
    .from("flagged_content")
    .update({ status: "banned" })
    .eq("offender_id", offenderId)
    .eq("status", "pending");
  if (closed.error) return { error: closed.error.message };

  refreshArena();
  return { message: "Account banned." };
}
