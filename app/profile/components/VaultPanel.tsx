"use client";

import { useEffect, useState, useTransition } from "react";
import { createStripeConnectAccount } from "@/lib/actions/stripe";
import { requestDisbursement } from "@/lib/actions/disbursement";
import { supabase } from "@/lib/db/supabase";
import type { EscrowBalance } from "@/lib/queries/campaign-hub";

function usd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function VaultPanel({
  candidateId,
  electionId,
  officeName,
  escrow,
  stripeOnboardingComplete,
  onChanged,
}: {
  candidateId: string;
  electionId: string;
  officeName: string;
  escrow: EscrowBalance;
  stripeOnboardingComplete: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const canRequest = stripeOnboardingComplete && escrow.available > 0;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function connectBank() {
    if (pending) return;
    setError(null);

    startTransition(async () => {
      try {
        const result = await createStripeConnectAccount();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.assign(result.url);
      } catch {
        setError("We couldn't start Stripe onboarding. Please try again.");
      }
    });
  }

  function requestPayout() {
    if (pending || !canRequest) return;
    setError(null);

    startTransition(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const result = await requestDisbursement(
          candidateId,
          electionId,
          data.session?.access_token,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setToast(`Payout requested: ${usd(result.amount)} for ${officeName}.`);
        await onChanged();
      } catch {
        setError("We couldn't request that payout. Please try again.");
      }
    });
  }

  return (
    <section
      aria-label={`Campaign vault for ${officeName}`}
      className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4"
    >
      <h4 className="font-display text-base font-semibold tracking-tight text-parchment">
        Campaign Vault &amp; Disbursements
      </h4>

      {stripeOnboardingComplete ? (
        <>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Available balance
              </dt>
              <dd className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-gold">
                {usd(escrow.available)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Locked in escrow
              </dt>
              <dd className="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight text-parchment">
                {usd(escrow.locked)}
              </dd>
            </div>
          </dl>

          {escrow.disbursed > 0 ? (
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {usd(escrow.disbursed)} already paid out.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canRequest || pending}
              onClick={requestPayout}
              className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Requesting…" : canRequest ? "Request Payout" : "No funds to pay out"}
            </button>
            <p className="text-xs leading-5 text-zinc-500">
              Payouts transfer to the bank account linked on Stripe.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-sm leading-6 text-zinc-400">
            Link a bank account through Stripe before this vault can pay out released escrow.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={connectBank}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Connecting…" : "Connect Bank Account"}
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
        >
          <p className="rounded-full border border-gold bg-zinc-950 px-4 py-2 text-sm text-gold shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </section>
  );
}
