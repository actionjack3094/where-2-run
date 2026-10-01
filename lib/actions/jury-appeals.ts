"use server";

import { revalidatePath } from "next/cache";
import { debateDistrictOcdId } from "@/lib/actions/debate-resolution";
import { resolveJuryAppeal } from "@/lib/actions/jury-resolution";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { checkLocalEligibility } from "@/lib/civic-fencing";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  APPEAL_REASON_MAX,
  isResolvedDebate,
  withinAppealWindow,
  type DebateResolutionClock,
} from "@/lib/jury-window";
import { notifyAppealFiled } from "@/lib/notifications/inbox";
import type { Debate, JuryAppeal } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type JuryAppealActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const GENERIC_APPEAL_ERROR = "We couldn't file that appeal. Please try again.";
const GENERIC_VERDICT_ERROR = "We couldn't record that verdict. Please try again.";
const CONSTITUENT_APPEAL_ERROR = "Only verified constituents can appeal this debate.";
const CONSTITUENT_JURY_ERROR = "Only verified constituents can serve on this jury";
const WINDOW_ERROR = "Outside the 24-hour appeal window";

type DebateWithResolution = Debate & DebateResolutionClock;

function isMissingColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /appellant_id|jury_verdicts|column .* does not exist/i.test(message)
  );
}

function missingAppealsMessage() {
  return "jury_appeals is not in the database yet. Apply the jury appeals migration.";
}

function missingVerdictsMessage() {
  return "jury_verdicts is not in the database yet. Apply the jury appeal filings migration.";
}

function asOcdIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

async function isVerifiedConstituent(
  admin: AdminClient,
  userId: string,
  districtOcdId: string | null,
) {
  if (!districtOcdId) return false;

  const { data, error } = await admin
    .from("tier2_verifications")
    .select("ocd_ids")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }

  return checkLocalEligibility(asOcdIds(data?.ocd_ids), districtOcdId);
}

function revalidateAppeal(debateId: string, appealId?: string) {
  revalidatePath("/feed");
  revalidatePath("/spectator/jury");
  revalidatePath(`/debates/${debateId}`);
  if (appealId) revalidatePath(`/spectator/jury/${appealId}`);
}

/**
 * File a contest of a completed debate. Only a Tier 2 verified constituent of
 * the debate's district may appeal, and only within 24 hours of resolution.
 */
export async function fileDebateAppeal(
  debateId: string,
  reason: string,
  accessToken?: string | null,
): Promise<JuryAppealActionResult<{ appealId: string }>> {
  const id = debateId.trim();
  const grounds = reason.trim();

  if (!isUuid(id)) return { ok: false, error: "Choose a valid debate to appeal." };
  if (!grounds) return { ok: false, error: "Explain why you are appealing this outcome." };
  if (grounds.length > APPEAL_REASON_MAX) {
    return { ok: false, error: `Appeal reasons are capped at ${APPEAL_REASON_MAX} characters.` };
  }

  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to appeal this debate." };

    const admin = createAdminClient();
    const { data: debateRow, error: debateError } = await admin
      .from("debates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (debateError) throw debateError;

    const debate = debateRow as DebateWithResolution | null;
    if (!debate) return { ok: false, error: "Debate not found." };
    if (!isResolvedDebate(debate.status)) {
      return { ok: false, error: "Only a resolved debate can be appealed." };
    }
    if (!withinAppealWindow(debate)) {
      return { ok: false, error: WINDOW_ERROR };
    }

    const districtOcdId = await debateDistrictOcdId(admin, debate);
    const eligible = await isVerifiedConstituent(admin, userId, districtOcdId);
    if (!eligible) return { ok: false, error: CONSTITUENT_APPEAL_ERROR };

    const { data: existing, error: existingError } = await admin
      .from("jury_appeals")
      .select("id")
      .eq("debate_id", debate.id)
      .eq("appellant_id", userId)
      .maybeSingle();
    if (existingError) {
      if (isMissingRelation(existingError)) return { ok: false, error: missingAppealsMessage() };
      if (isMissingColumn(existingError)) return { ok: false, error: missingAppealsMessage() };
      throw existingError;
    }
    if (existing) return { ok: false, error: "You've already appealed this debate." };

    const { data: created, error: insertError } = await admin
      .from("jury_appeals")
      .insert({
        debate_id: debate.id,
        appellant_id: userId,
        reason: grounds,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !created) {
      if (insertError && isMissingRelation(insertError)) {
        return { ok: false, error: missingAppealsMessage() };
      }
      if (insertError && isMissingColumn(insertError)) {
        return { ok: false, error: missingAppealsMessage() };
      }
      if (insertError?.code === "23505") {
        return { ok: false, error: "You've already appealed this debate." };
      }
      throw insertError ?? new Error("Appeal insert returned no row.");
    }

    await notifyAppealFiled(admin, {
      appealId: created.id,
      candidateIds: [debate.candidate_a_id, debate.candidate_b_id],
    });

    revalidateAppeal(debate.id, created.id);
    return { ok: true, appealId: created.id };
  } catch (caught) {
    console.error("fileDebateAppeal failed.", caught);
    return { ok: false, error: GENERIC_APPEAL_ERROR };
  }
}

/**
 * Cast a peer-juror verdict on a pending appeal. The juror must be a Tier 2
 * verified constituent of the debate's district, and cannot be the appellant
 * or either seated candidate.
 */
export async function submitJuryVerdict(
  appealId: string,
  overturned: boolean,
  accessToken?: string | null,
): Promise<JuryAppealActionResult<{ verdictId: string }>> {
  const id = appealId.trim();
  if (!isUuid(id)) return { ok: false, error: "Choose a valid appeal to review." };
  if (typeof overturned !== "boolean") {
    return { ok: false, error: "Choose whether to overturn or uphold this outcome." };
  }

  try {
    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to serve on this jury." };

    const admin = createAdminClient();
    const { data: appealRow, error: appealError } = await admin
      .from("jury_appeals")
      .select("id, debate_id, appellant_id, status")
      .eq("id", id)
      .maybeSingle();
    if (appealError) {
      if (isMissingRelation(appealError)) return { ok: false, error: missingAppealsMessage() };
      if (isMissingColumn(appealError)) return { ok: false, error: missingAppealsMessage() };
      throw appealError;
    }

    const appeal = appealRow as Pick<
      JuryAppeal,
      "id" | "debate_id" | "appellant_id" | "status"
    > | null;
    if (!appeal || !appeal.appellant_id) {
      return { ok: false, error: "Appeal not found." };
    }
    if (appeal.status !== "pending") {
      return { ok: false, error: "This appeal is closed." };
    }

    const { data: debateRow, error: debateError } = await admin
      .from("debates")
      .select("*")
      .eq("id", appeal.debate_id)
      .maybeSingle();
    if (debateError) throw debateError;

    const debate = debateRow as Debate | null;
    if (!debate) return { ok: false, error: "Debate not found." };

    if (userId === appeal.appellant_id) {
      return { ok: false, error: "You can't serve on a jury for your own appeal." };
    }
    if (userId === debate.candidate_a_id || userId === debate.candidate_b_id) {
      return { ok: false, error: "Candidates in this debate can't serve on the jury." };
    }

    const districtOcdId = await debateDistrictOcdId(admin, debate);
    const eligible = await isVerifiedConstituent(admin, userId, districtOcdId);
    if (!eligible) return { ok: false, error: CONSTITUENT_JURY_ERROR };

    const { data: created, error: insertError } = await admin
      .from("jury_verdicts")
      .insert({
        appeal_id: appeal.id,
        juror_id: userId,
        overturned,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      if (insertError && isMissingRelation(insertError)) {
        return { ok: false, error: missingVerdictsMessage() };
      }
      if (insertError && isMissingColumn(insertError)) {
        return { ok: false, error: missingVerdictsMessage() };
      }
      if (insertError?.code === "23505") {
        return { ok: false, error: "You already cast a verdict on this appeal." };
      }
      throw insertError ?? new Error("Verdict insert returned no row.");
    }

    try {
      await resolveJuryAppeal(appeal.id);
    } catch (caught) {
      console.error("resolveJuryAppeal failed.", caught);
    }

    revalidateAppeal(debate.id, appeal.id);
    return { ok: true, verdictId: created.id };
  } catch (caught) {
    console.error("submitJuryVerdict failed.", caught);
    return { ok: false, error: GENERIC_VERDICT_ERROR };
  }
}
