import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";
import { getStripe } from "@/lib/stripe";

type CheckoutBody = {
  amount?: number;
  candidateId?: string;
  candidateName?: string;
  message?: string | null;
  donorName?: string | null;
};

function asMetadataValue(value: string | null | undefined, max = 500) {
  if (!value) return "";
  return value.trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const amount = Number(body.amount);
    const candidateId = body.candidateId?.trim();
    const candidateName = body.candidateName?.trim();

    if (!candidateId || !candidateName) {
      return NextResponse.json(
        { error: "A candidate is required to start checkout." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Enter an amount greater than zero." },
        { status: 400 },
      );
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      return NextResponse.json(
        { error: `Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.` },
        { status: 400 },
      );
    }

    const amountCents = Math.round(amount * 100);
    if (amountCents < 50) {
      return NextResponse.json(
        { error: "Stripe requires a minimum authorization of $0.50." },
        { status: 400 },
      );
    }

    const origin = request.nextUrl.origin;
    const message = asMetadataValue(body.message, 280);
    const donorName = asMetadataValue(body.donorName, 80);
    const metadata: Stripe.MetadataParam = {
      candidateId,
      candidateName,
      amount: amount.toFixed(2),
      donorName,
      message,
    };

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Campaign pledge — ${candidateName}`,
              description:
                "Authorized hold only. Funds stay in escrow until capture.",
            },
          },
        },
      ],
      payment_intent_data: {
        capture_method: "manual",
        transfer_group: `pledge_${candidateId}`,
        metadata,
      },
      metadata,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/candidate/${candidateId}`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    const message =
      error instanceof Stripe.errors.StripeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not start Stripe checkout.";
    const status =
      error instanceof Stripe.errors.StripeError ? (error.statusCode ?? 500) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
