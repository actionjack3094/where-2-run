import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd } from "@/lib/pledges";
import { getStripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Pledge authorized · WHERE 2 RUN",
  description: "Your campaign pledge is authorized and held in escrow.",
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

export default async function CheckoutSuccessPage(
  props: PageProps<"/checkout/success">,
) {
  const query = await props.searchParams;
  const sessionId = firstString(query.session_id) ?? null;

  let amountLabel: string | null = null;
  let candidateName: string | null = null;
  let candidateId: string | null = null;
  let heldInEscrow = false;

  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });
      const paymentIntent =
        session.payment_intent && typeof session.payment_intent !== "string"
          ? session.payment_intent
          : null;

      amountLabel =
        session.amount_total != null ? formatUsd(session.amount_total / 100) : null;
      candidateName = session.metadata?.candidateName?.trim() || null;
      candidateId = session.metadata?.candidateId?.trim() || null;
      heldInEscrow =
        session.status === "complete" &&
        (paymentIntent?.status === "requires_capture" ||
          paymentIntent?.capture_method === "manual");
    } catch {
      heldInEscrow = false;
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
        Stripe escrow
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Pledge authorized.</h1>
      <p className="mt-4 text-base leading-7 text-zinc-500 dark:text-zinc-400">
        {heldInEscrow
          ? "The card was authorized, not captured. This hold stays in escrow until the campaign captures it."
          : "Stripe sent you back after checkout. The authorization is held in escrow until capture — nothing is transferred yet."}
      </p>

      <Card className="mt-10">
        <CardHeader>
          <CardTitle>
            {candidateName ? `Backing ${candidateName}` : "Campaign pledge"}
          </CardTitle>
          <CardDescription>
            Auth & Capture checkout. Funds are not transferred until capture.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {amountLabel && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Authorized amount: <span className="font-medium text-zinc-950 dark:text-zinc-50">{amountLabel}</span>
            </p>
          )}
          {sessionId && (
            <p className="truncate text-xs text-zinc-400">Session {sessionId}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {candidateId ? (
              <Button asChild>
                <Link href={`/candidate/${candidateId}`}>Back to campaign</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/spectator">Open the donor feed</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
