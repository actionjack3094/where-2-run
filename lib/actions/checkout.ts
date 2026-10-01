"use server";

import { headers } from "next/headers";
import Stripe from "stripe";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";
import { dollarsToCents, getStripe } from "@/lib/stripe";

export type PledgeCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const GENERIC_ERROR = "We couldn't start checkout. Please try again.";
const MIN_STRIPE_CENTS = 50;

async function requestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

function stripeMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error && /STRIPE_SECRET_KEY/i.test(error.message)) {
    return "Stripe is not configured. Add STRIPE_SECRET_KEY to accept pledges.";
  }
  return GENERIC_ERROR;
}

/**
 * Open a Stripe Checkout Session that collects a pledge up front. Funds stay
 * in the platform balance. The webhook writes the `campaign_pledges` row only
 * after `checkout.session.completed`.
 */
export async function createPledgeCheckout(
  candidateId: string,
  electionId: string,
  amount: number,
): Promise<PledgeCheckoutResult> {
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

    const amountCents = dollarsToCents(amount);
    if (amountCents < MIN_STRIPE_CENTS) {
      return { ok: false, error: "Stripe requires a minimum pledge of $0.50." };
    }

    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to pledge." };
    if (userId === candidate) {
      return { ok: false, error: "You can't pledge to your own campaign." };
    }

    const admin = createAdminClient();
    const [{ data: candidateRow, error: candidateError }, { data: election, error: electionError }] =
      await Promise.all([
        admin.from("users").select("id, username").eq("id", candidate).maybeSingle(),
        admin.from("elections").select("id, office_name").eq("id", race).maybeSingle(),
      ]);
    if (candidateError) throw candidateError;
    if (electionError) throw electionError;
    if (!candidateRow) return { ok: false, error: "That candidate could not be found." };
    if (!election) return { ok: false, error: "That race is no longer on the ballot." };

    const origin = await requestOrigin();
    const name = candidateRow.username?.trim() || "this campaign";
    const office = election.office_name?.trim();
    const metadata: Stripe.MetadataParam = {
      candidateId: candidate,
      electionId: election.id,
      userId,
    };

    const session = await getStripe().checkout.sessions.create({
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
              name: office ? `Pledge to ${name} — ${office}` : `Pledge to ${name}`,
              description:
                "Paid now and held by the platform until the candidate's alignment streak releases it.",
            },
          },
        },
      ],
      payment_intent_data: { metadata },
      success_url: `${origin}/candidate/${candidate}?pledge=success`,
      cancel_url: `${origin}/candidate/${candidate}`,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return { ok: true, url: session.url };
  } catch (caught) {
    console.error("createPledgeCheckout failed.", caught);
    return { ok: false, error: stripeMessage(caught) };
  }
}
