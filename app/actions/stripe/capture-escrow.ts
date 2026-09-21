"use server";

import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { parseAmount } from "@/lib/pledges";
import { dollarsToCents, getStripe } from "@/lib/stripe";
import type { CampaignPledge } from "@/types/database.types";

type CaptureRow = Pick<
  CampaignPledge,
  | "id"
  | "amount"
  | "stripe_customer_id"
  | "stripe_payment_method_id"
  | "candidate_id"
  | "election_id"
  | "donor_id"
>;

export type CaptureEscrowResult = {
  ok: true;
  candidateId: string;
  attempted: number;
  captured: number;
  failed: number;
  skipped: number;
  errors: { pledgeId: string; message: string }[];
};

function missingTableMessage() {
  return "campaign_pledges is not in the database yet. Apply the conditional escrow migration.";
}

function stripeMessage(error: unknown, fallback: string) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function captureEscrow(
  candidateId: string,
  accessToken?: string | null,
): Promise<CaptureEscrowResult> {
  const trimmedCandidateId = candidateId.trim();
  if (!isUuid(trimmedCandidateId)) {
    throw new Error("A valid candidate is required.");
  }

  const actorId = await requireActionUserId(accessToken);
  if (!actorId) throw new Error("Sign in to capture escrow.");
  if (actorId !== trimmedCandidateId) {
    throw new Error("Only the filing candidate can capture their escrow pledges.");
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("campaign_pledges")
    .select(
      "id, amount, stripe_customer_id, stripe_payment_method_id, candidate_id, election_id, donor_id",
    )
    .eq("candidate_id", trimmedCandidateId)
    .eq("status", "pending");

  if (error) {
    if (isMissingRelation(error)) throw new Error(missingTableMessage());
    throw new Error(error.message);
  }

  const pledges = (rows ?? []) as CaptureRow[];
  const stripe = getStripe();
  const errors: CaptureEscrowResult["errors"] = [];
  let captured = 0;
  let failed = 0;
  let skipped = 0;

  for (const pledge of pledges) {
    const paymentMethodId = pledge.stripe_payment_method_id?.trim() ?? "";
    const customerId = pledge.stripe_customer_id?.trim() ?? "";
    const amountCents = dollarsToCents(parseAmount(pledge.amount));

    if (!paymentMethodId || !customerId || amountCents < 50) {
      skipped += 1;
      continue;
    }

    try {
      await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          pledge_id: pledge.id,
          candidate_id: pledge.candidate_id,
          election_id: pledge.election_id,
          donor_id: pledge.donor_id,
        },
      });

      const { error: updateError } = await admin
        .from("campaign_pledges")
        .update({
          status: "captured",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pledge.id)
        .eq("status", "pending");

      if (updateError) throw new Error(updateError.message);
      captured += 1;
    } catch (caught) {
      failed += 1;
      const message = stripeMessage(caught, "Off-session charge failed.");
      errors.push({ pledgeId: pledge.id, message });
      await admin
        .from("campaign_pledges")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pledge.id)
        .eq("status", "pending");
    }
  }

  revalidatePath(`/profile/${trimmedCandidateId}`);
  revalidatePath("/my-campaign");
  revalidatePath("/spectator");

  return {
    ok: true,
    candidateId: trimmedCandidateId,
    attempted: pledges.length,
    captured,
    failed,
    skipped,
    errors,
  };
}
