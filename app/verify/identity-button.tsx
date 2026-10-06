"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createIdentityVerificationSession } from "@/lib/actions/stripe";
import { Button } from "@/components/ui/button";

let stripePromise: Promise<Stripe | null> | null = null;

function browserStripe() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

export function IdentityVerifyButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startVerification() {
    setPending(true);
    setError(null);
    try {
      const result = await createIdentityVerificationSession();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (("status" in result && result.status === "verified") || !result.url) {
        if (result.clientSecret) {
          const stripe = await browserStripe();
          if (!stripe) {
            setError("Stripe is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.");
            return;
          }
          const modal = await stripe.verifyIdentity(result.clientSecret);
          if (modal.error) {
            setError(modal.error.message ?? "Identity verification was not completed.");
            return;
          }
          router.refresh();
          return;
        }
        router.refresh();
        return;
      }
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open identity verification.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-gold/50 bg-white px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">
        Stripe Identity
      </p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
        Confirm a government ID so this account can be ranked under a legal name. Stripe
        collects the document. Where 2 Run stores the verification result.
      </p>
      <Button
        type="button"
        variant="gold"
        className="mt-5"
        disabled={pending}
        onClick={() => void startVerification()}
      >
        {pending ? "Opening Stripe…" : "Verify Identity with Stripe"}
      </Button>
      {error ? <p className="mt-3 text-sm leading-6 text-stone-600">{error}</p> : null}
    </div>
  );
}
