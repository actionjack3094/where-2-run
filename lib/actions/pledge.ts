"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { ALIGNMENT_STREAK_UNLOCK_CONDITION } from "@/lib/escrow";
import { notifyPledgeReceived } from "@/lib/notifications/inbox";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";
import { dollarsToCents, getStripe } from "@/lib/stripe";

export type SubmitPledgeResult =
  | { ok: true; pledgeId: string; amount: number; alreadyPledged: boolean }
  | { ok: false; error: string };

const GENERIC_ERROR = "We couldn't lock in that pledge. Please try again.";

/**
 * Lock in a conditional pledge for a candidate in a race. Writes a `pending`
 * row to `campaign_pledges` (donor, candidate, election, amount) that releases
 * once the candidate reaches a 10-debate alignment streak in the district.
 * No card is charged here.
 *
 * `electionId` may be an election id or a district id; both resolve to the
 * election. Pledging twice to the same candidate and race is a no-op that
 * returns the existing pledge. Failures come back as a clean `error` string,
 * never a raw database message.
 */
export async function submitPledge(
  candidateId: string,
  electionId: string,
  amount: number,
  accessToken?: string | null,
): Promise<SubmitPledgeResult> {
  try {
    const candidate = candidateId?.trim() ?? "";
    if (!isUuid(candidate)) return { ok: false, error: "Choose a valid candidate to back." };
    if (!isUuid(electionId?.trim() ?? "")) {
      return { ok: false, error: "This debate is not tied to a race yet." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Enter an amount greater than zero." };
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      return { ok: false, error: `Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.` };
    }

    const donorId = await requireActionUserId(accessToken);
    if (!donorId) return { ok: false, error: "Sign in to pledge." };
    if (donorId === candidate) {
      return { ok: false, error: "You can't pledge to your own campaign." };
    }

    const admin = createAdminClient();

    const { data: candidateRow, error: candidateError } = await admin
      .from("users")
      .select("id")
      .eq("id", candidate)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidateRow) return { ok: false, error: "That candidate could not be found." };

    // Accept an election id or a district id (debates can carry either).
    const { data: election, error: electionError } = await admin
      .from("elections")
      .select("id")
      .or(`id.eq.${electionId.trim()},district_id.eq.${electionId.trim()}`)
      .limit(1)
      .maybeSingle();
    if (electionError) throw electionError;
    if (!election) return { ok: false, error: "That race is no longer on the ballot." };

    const findOpen = () =>
      admin
        .from("campaign_pledges")
        .select("id, amount")
        .eq("donor_id", donorId)
        .eq("candidate_id", candidate)
        .eq("election_id", election.id)
        .eq("status", "pending")
        .is("stripe_setup_intent_id", null)
        .limit(1)
        .maybeSingle();

    const existing = await findOpen();
    if (existing.error) throw existing.error;
    if (existing.data) {
      return {
        ok: true,
        pledgeId: existing.data.id,
        amount: Number(existing.data.amount),
        alreadyPledged: true,
      };
    }

    const { data: pledge, error: insertError } = await admin
      .from("campaign_pledges")
      .insert({
        donor_id: donorId,
        candidate_id: candidate,
        election_id: election.id,
        amount,
        unlock_condition: ALIGNMENT_STREAK_UNLOCK_CONDITION,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !pledge) {
      // 23505: a parallel click inserted the same open pledge first.
      if (insertError?.code === "23505") {
        const raced = await findOpen();
        if (raced.data) {
          return {
            ok: true,
            pledgeId: raced.data.id,
            amount: Number(raced.data.amount),
            alreadyPledged: true,
          };
        }
      }
      throw insertError ?? new Error("Pledge insert returned no row.");
    }

    await notifyPledgeReceived(admin, {
      candidateId: candidate,
      electionId: election.id,
      amount,
      pledgeId: pledge.id,
    });

    revalidatePath(`/candidate/${candidate}`);
    revalidatePath(`/profile/${candidate}`);
    revalidatePath("/elections/[slug]/profile", "page");
    revalidatePath("/spectator");
    revalidatePath("/my-campaign");

    return { ok: true, pledgeId: pledge.id, amount, alreadyPledged: false };
  } catch (caught) {
    // Log the real error server-side; the client only sees a clean message.
    console.error("submitPledge failed.", caught);
    return { ok: false, error: GENERIC_ERROR };
  }
}

const MIN_STRIPE_CENTS = 50;

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

export type PledgeFundsResult = {
  url: string;
  sessionId: string;
};

/**
 * Open Stripe Checkout for a locked campaign target. The session authorizes
 * the card and leaves capture manual, so the charge stays in escrow until a
 * later capture. `checkout.session.completed` writes the ledger row.
 */
export async function pledgeFunds(targetId: string, amount: number): Promise<PledgeFundsResult> {
  const userId = await requireActionUserId();
  if (!userId) throw new Error("Sign in to pledge.");

  const id = targetId.trim();
  if (!isUuid(id)) throw new Error("A campaign target is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (amount > MAX_PLEDGE_AMOUNT) {
    throw new Error(`Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.`);
  }

  const amountCents = dollarsToCents(amount);
  if (amountCents < MIN_STRIPE_CENTS) {
    throw new Error("Stripe requires a minimum authorization of $0.50.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, user_id, election_id, is_locked, escrow_status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const target = data as {
    id: string;
    user_id: string;
    election_id: string;
    is_locked: boolean | null;
    escrow_status: string | null;
  } | null;

  if (!target) throw new Error("That campaign target is not on the ledger.");
  if (!target.is_locked) throw new Error("This campaign is not open for pledges.");
  if (target.escrow_status && target.escrow_status !== "accumulating") {
    throw new Error("This campaign is not accepting escrow pledges.");
  }
  if (target.user_id === userId) throw new Error("You cannot pledge to your own campaign.");
  if (!isUuid(target.election_id)) throw new Error("That campaign is not tied to a race.");

  const metadata: Stripe.MetadataParam = {
    target_id: target.id,
    user_id: userId,
  };
  const origin = await requestOrigin();

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      client_reference_id: userId,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Campaign escrow pledge",
              description: "Card authorization only. Funds stay held until the campaign captures them.",
            },
          },
        },
      ],
      payment_intent_data: {
        capture_method: "manual",
        metadata,
      },
      success_url: `${origin}/candidate/${target.user_id}?pledge=held`,
      cancel_url: `${origin}/candidate/${target.user_id}`,
    });
  } catch (caught) {
    if (caught instanceof Stripe.errors.StripeError) throw new Error(caught.message);
    throw caught;
  }

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url, sessionId: session.id };
}
