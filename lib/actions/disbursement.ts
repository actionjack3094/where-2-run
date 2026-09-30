"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";

export type RequestDisbursementResult =
  | { ok: true; disbursed: number; amount: number }
  | { ok: false; error: string };

/**
 * Pay out a candidate's released pledges for one race: `released` ->
 * `disbursed`. Only the candidate themselves can request it.
 *
 * MOCK PAYOUT: this records the request only. No money moves. The real
 * transfer (Stripe Connect to the committee's bank account, gated on the
 * verified treasurer filing) belongs where the marked comment is below.
 *
 * Claim-once: the update only matches `released` rows, so a double click or a
 * retry disburses nothing extra. Database errors are logged, never returned.
 */
export async function requestDisbursement(
  candidateId: string,
  electionId: string,
  accessToken?: string | null,
): Promise<RequestDisbursementResult> {
  try {
    if (!isUuid(candidateId?.trim() ?? "") || !isUuid(electionId?.trim() ?? "")) {
      return { ok: false, error: "Choose a valid race to pay out." };
    }

    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to request a payout." };
    if (userId !== candidateId) {
      return { ok: false, error: "You can only request payouts for your own campaign." };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("campaign_pledges")
      .update({
        status: "disbursed",
        disbursed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("candidate_id", candidateId)
      .eq("election_id", electionId)
      .eq("status", "released")
      .select("id, amount");
    if (error) throw error;

    const rows = data ?? [];
    if (rows.length === 0) {
      return { ok: false, error: "There are no released funds to pay out for this race." };
    }

    // -------------------------------------------------------------------------
    // REAL TRANSFER GOES HERE. `rows` is exactly what this call just moved to
    // `disbursed`. Sum the amounts and create a Stripe Connect transfer to the
    // campaign committee's connected account (idempotency key per pledge id),
    // and only after the treasurer filing has been verified. If the transfer
    // fails, set these rows back to `released` so the candidate can retry.
    // -------------------------------------------------------------------------
    const amount = rows.reduce((sum, row) => sum + Number(row.amount), 0);

    revalidatePath("/profile");
    return { ok: true, disbursed: rows.length, amount };
  } catch (caught) {
    console.error("requestDisbursement failed.", caught);
    return { ok: false, error: "We couldn't request that payout. Please try again." };
  }
}
