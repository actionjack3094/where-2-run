"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { ALIGNMENT_STREAK_UNLOCK_CONDITION } from "@/lib/escrow";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";

export type SubmitPledgeResult =
  | { ok: true; pledgeId: string; amount: number }
  | { ok: false; error: string };

const GENERIC_ERROR = "We couldn't lock in that pledge. Please try again.";

/**
 * Record a supporter pledge in a candidate's escrow vault. Funds stay
 * `pending` until the candidate's 10-debate alignment streak releases them.
 */
export async function submitPledge(
  candidateId: string,
  electionId: string,
  amount: number,
): Promise<SubmitPledgeResult> {
  try {
    const candidate = candidateId?.trim() ?? "";
    const race = electionId?.trim() ?? "";
    if (!isUuid(candidate)) return { ok: false, error: "Choose a valid candidate to back." };
    if (!isUuid(race)) return { ok: false, error: "Choose a valid race to pledge toward." };

    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Enter an amount greater than zero." };
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      return { ok: false, error: `Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.` };
    }

    const dollars = Math.round(amount * 100) / 100;
    const donorId = await requireActionUserId();
    if (!donorId) return { ok: false, error: "Sign in to pledge." };
    if (donorId === candidate) {
      return { ok: false, error: "You can't pledge to your own campaign." };
    }

    const admin = createAdminClient();

    const [{ data: candidateRow, error: candidateError }, { data: election, error: electionError }] =
      await Promise.all([
        admin.from("users").select("id").eq("id", candidate).maybeSingle(),
        admin.from("elections").select("id").eq("id", race).maybeSingle(),
      ]);
    if (candidateError) throw candidateError;
    if (electionError) throw electionError;
    if (!candidateRow) return { ok: false, error: "That candidate could not be found." };
    if (!election) return { ok: false, error: "That race is no longer on the ballot." };

    const { data: pledge, error: insertError } = await admin
      .from("campaign_pledges")
      .insert({
        donor_id: donorId,
        candidate_id: candidate,
        election_id: election.id,
        amount: dollars,
        unlock_condition: ALIGNMENT_STREAK_UNLOCK_CONDITION,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !pledge) {
      if (insertError?.code === "23505") {
        return { ok: false, error: "You already have a pending pledge for this race." };
      }
      throw insertError ?? new Error("Pledge insert returned no row.");
    }

    revalidatePath(`/candidate/${candidate}`);
    revalidatePath("/candidate/[id]", "page");
    return { ok: true, pledgeId: pledge.id, amount: dollars };
  } catch (caught) {
    console.error("submitPledge failed.", caught);
    return { ok: false, error: GENERIC_ERROR };
  }
}
