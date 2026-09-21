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
import { completePledge } from "@/app/actions/stripe/create-pledge";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";

export const metadata: Metadata = {
  title: "Pledge vaulted · WHERE 2 RUN",
  description: "Your campaign pledge card is vaulted in conditional escrow.",
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

export default async function PledgeCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const pledgeId = firstString(query.pledge_id) ?? "";
  const sessionId = firstString(query.session_id) ?? "";
  const redirectStatus = firstString(query.redirect_status) ?? "";
  const candidateName = firstString(query.candidate)?.trim() || null;

  let vaulted = false;
  let error: string | null = null;

  if (redirectStatus && redirectStatus !== "succeeded") {
    error = "Stripe did not finish vaulting this card. No charge was made.";
  } else if (!isUuid(pledgeId)) {
    error = "This escrow return is missing a pledge.";
  } else {
    try {
      const userId = await requireActionUserId();
      if (!userId) {
        error = "Sign in to finish vaulting this pledge.";
      } else {
        await completePledge(pledgeId, null, sessionId || null);
        vaulted = true;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not finish vaulting this pledge.";
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
        Conditional escrow
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {vaulted ? "Card vaulted." : "Escrow incomplete."}
      </h1>
      <p className="mt-4 text-base leading-7 text-zinc-500 dark:text-zinc-400">
        {vaulted
          ? "Stripe stored the payment method. Funds stay uncharged until this candidate files."
          : (error ?? "Return from Stripe SetupIntent checkout to finish vaulting.")}
      </p>

      <Card className="mt-10">
        <CardHeader>
          <CardTitle>
            {candidateName ? `Backing ${candidateName}` : "Campaign pledge"}
          </CardTitle>
          <CardDescription>
            SetupIntent checkout. Capture runs only after an official filing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/spectator">Open the donor feed</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
