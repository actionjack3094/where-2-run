"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { notifyPayoutDisbursed } from "@/lib/notifications/inbox";
import { dollarsToCents, getStripe } from "@/lib/stripe";

export type RequestPayoutResult =
  | { ok: true; disbursed: number; amount: number }
  | { ok: false; error: string };

export type RequestDisbursementResult = RequestPayoutResult;

const GENERIC_ERROR = "We couldn't send that payout. Please try again.";
const NO_FUNDS = "There are no released funds to pay out for this race.";
const CONNECT_FIRST = "Connect a bank account in the vault before requesting a payout.";

function stripeMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    const message = error.message ?? "";
    if (/insufficient funds|balance/i.test(message)) {
      return "The platform balance can't cover this payout yet. Try again after the Checkout funds settle.";
    }
    return message;
  }
  if (error instanceof Error && /STRIPE_SECRET_KEY/i.test(error.message)) {
    return "Stripe is not configured. Add STRIPE_SECRET_KEY to send payouts.";
  }
  return GENERIC_ERROR;
}

function payoutIdempotencyKey(pledgeIds: string[]) {
  const digest = createHash("sha256").update(pledgeIds.join(",")).digest("hex");
  return `escrow-payout-${digest.slice(0, 32)}`;
}

/**
 * Move a candidate's released escrow for one race from the platform balance
 * to their Stripe Express account, then mark those pledges `disbursed`.
 * Only the candidate themselves can request it.
 *
 * The transfer uses an idempotency key over the released pledge ids, so a
 * retry after a ledger failure does not send the money twice.
 */
export async function requestPayout(
  candidateId: string,
  electionId: string,
  accessToken?: string | null,
): Promise<RequestPayoutResult> {
  try {
    const candidate = candidateId?.trim() ?? "";
    const race = electionId?.trim() ?? "";
    if (!isUuid(candidate) || !isUuid(race)) {
      return { ok: false, error: "Choose a valid race to pay out." };
    }

    const userId = await requireActionUserId(accessToken);
    if (!userId) return { ok: false, error: "Sign in to request a payout." };
    if (userId !== candidate) {
      return { ok: false, error: "You can only request payouts for your own campaign." };
    }

    const admin = createAdminClient();
    const { data: connect, error: connectError } = await admin
      .from("profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("id", candidate)
      .maybeSingle();
    if (connectError && !isMissingSchema(connectError)) throw connectError;

    const stripeAccountId = connect?.stripe_account_id?.trim() ?? "";
    if (!connect?.stripe_onboarding_complete || !/^acct_[A-Za-z0-9]+$/.test(stripeAccountId)) {
      return { ok: false, error: CONNECT_FIRST };
    }

    const { data: pledges, error: pledgeError } = await admin
      .from("campaign_pledges")
      .select("id, amount")
      .eq("candidate_id", candidate)
      .eq("election_id", race)
      .eq("status", "released");
    if (pledgeError) throw pledgeError;

    const rows = pledges ?? [];
    const totalCents = rows.reduce((sum, row) => sum + dollarsToCents(Number(row.amount)), 0);
    if (rows.length === 0 || totalCents <= 0) {
      return { ok: false, error: NO_FUNDS };
    }

    const pledgeIds = rows.map((row) => row.id).sort();
    const transfer = await getStripe().transfers.create(
      {
        amount: totalCents,
        currency: "usd",
        destination: stripeAccountId,
        description: "Escrow Payout",
        metadata: {
          candidateId: candidate,
          electionId: race,
        },
      },
      { idempotencyKey: payoutIdempotencyKey(pledgeIds) },
    );

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("campaign_pledges")
      .update({
        status: "disbursed",
        disbursed_at: now,
        updated_at: now,
      })
      .in("id", pledgeIds)
      .eq("status", "released")
      .eq("candidate_id", candidate)
      .eq("election_id", race)
      .select("id");
    if (updateError) {
      console.error("Stripe transfer succeeded but the vault ledger did not update.", {
        transferId: transfer.id,
        pledgeIds,
        updateError,
      });
      return {
        ok: false,
        error:
          "The transfer was sent, but the vault could not be updated. Request the payout again to finish recording it.",
      };
    }

    const amount = totalCents / 100;
    try {
      await notifyPayoutDisbursed(admin, {
        candidateId: candidate,
        electionId: race,
        amount,
      });
    } catch (notifyError) {
      console.error("Payout notification failed.", notifyError);
    }

    revalidatePath("/profile");
    return { ok: true, disbursed: updated?.length ?? pledgeIds.length, amount };
  } catch (caught) {
    console.error("requestPayout failed.", caught);
    return { ok: false, error: stripeMessage(caught) };
  }
}

/** @deprecated Use requestPayout. */
export async function requestDisbursement(
  candidateId: string,
  electionId: string,
  accessToken?: string | null,
): Promise<RequestDisbursementResult> {
  return requestPayout(candidateId, electionId, accessToken);
}
