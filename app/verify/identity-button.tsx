"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useState } from "react";
import { createIdentityVerificationSession } from "@/lib/actions/identity";
import { Button } from "@/components/ui/button";

let stripePromise: Promise<Stripe | null> | null = null;

function browserStripe() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

export function IdentityVerifyButton({ verified }: { verified: boolean }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(verified);
  const [message, setMessage] = useState<string | null>(
    verified ? "Your identity is verified." : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function startVerification() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createIdentityVerificationSession();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.clientSecret) {
        setDone(true);
        setMessage("Your identity is verified.");
        return;
      }

      const stripe = await browserStripe();
      if (!stripe) {
        setError(
          "Stripe is not configured in the browser. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.",
        );
        return;
      }

      const modal = await stripe.verifyIdentity(result.clientSecret);
      if (modal.error) {
        setError(modal.error.message ?? "Identity verification was not completed.");
        return;
      }

      setDone(true);
      setMessage(
        "Documents submitted. You'll be marked verified when Stripe confirms the check.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open identity verification.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
        Stripe Identity
      </p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
        Confirm a government ID so this account can vote and file as a real person.
        Stripe collects the document. Where 2 Run stores the verification result.
      </p>
      <Button
        type="button"
        variant="gold"
        className="mt-5"
        disabled={pending || done}
        onClick={() => void startVerification()}
      >
        {pending ? "Opening Stripe…" : done ? "Verified" : "Verify identity"}
      </Button>
      {message ? <p className="mt-3 text-sm leading-6 text-parchment">{message}</p> : null}
      {error ? <p className="mt-3 text-sm leading-6 text-zinc-400">{error}</p> : null}
    </div>
  );
}
