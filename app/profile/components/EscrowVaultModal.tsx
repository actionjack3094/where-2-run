"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useId, useMemo, useState } from "react";
import { createEscrowVaultSetupIntent } from "@/app/actions/escrow/create-setup-intent";
import { recordEscrowVaultPledge } from "@/app/actions/escrow/record-vault-pledge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { formatUsd, MAX_PLEDGE_AMOUNT, QUICK_PLEDGE_AMOUNTS } from "@/lib/pledges";
import { cn } from "@/lib/utils";

let stripePromise: Promise<Stripe | null> | null = null;

function browserStripe() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const ELEMENTS_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#d4b45a",
    colorBackground: "#09090b",
    colorText: "#e8e0c8",
    colorDanger: "#fca5a5",
    fontFamily: "inherit",
    borderRadius: "8px",
  },
};

export function EscrowVaultButton({
  electionId,
  officeName,
  className,
}: {
  electionId: string;
  officeName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="gold"
        size="lg"
        className={cn("w-full sm:w-auto", className)}
        onClick={() => setOpen(true)}
      >
        Vault a card
      </Button>
      {open ? (
        <EscrowVaultModal
          electionId={electionId}
          officeName={officeName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function EscrowVaultModal({
  electionId,
  officeName,
  onClose,
}: {
  electionId: string;
  officeName: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const stripe = browserStripe();
  const [preset, setPreset] = useState<(typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom">(
    50,
  );
  const [customAmount, setCustomAmount] = useState("20");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vaulted, setVaulted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const amount = useMemo(() => {
    if (preset !== "custom") return preset;
    const parsed = Number(customAmount);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [customAmount, preset]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function startSetupIntent(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      setFormError(`Bounties are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.`);
      return;
    }
    if (!stripe) {
      setFormError(
        "Stripe is not configured for in-browser card vaulting. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.",
      );
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await ensureArenaUser();
      const result = await createEscrowVaultSetupIntent({
        electionId,
        pledgedAmount: amount,
        accessToken: await accessToken(),
      });
      setClientSecret(result.clientSecret);
      setSetupIntentId(result.setupIntentId);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not open this escrow SetupIntent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-auto w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-gold">
            Off-session escrow
          </p>
          <CardTitle id={titleId}>
            {vaulted ? "Card vaulted" : `Conditional bounty — ${officeName}`}
          </CardTitle>
          <CardDescription>
            {vaulted
              ? "The payment method is saved. Nothing is charged until a candidate files."
              : "Save a card now. WHERE 2 RUN charges it later, while you are offline, when a candidate files."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vaulted ? (
            <Button type="button" variant="gold" className="w-full" onClick={onClose}>
              Close
            </Button>
          ) : clientSecret && setupIntentId && stripe ? (
            <Elements
              stripe={stripe}
              options={{
                clientSecret,
                appearance: ELEMENTS_APPEARANCE,
              }}
            >
              <VaultCardForm
                amount={amount}
                electionId={electionId}
                officeName={officeName}
                setupIntentId={setupIntentId}
                busy={busy}
                formError={formError}
                onBusy={setBusy}
                onError={setFormError}
                onVaulted={() => setVaulted(true)}
                onBack={() => {
                  setClientSecret(null);
                  setSetupIntentId(null);
                  setFormError(null);
                }}
                onClose={onClose}
              />
            </Elements>
          ) : (
            <AmountForm
              amount={amount}
              busy={busy}
              customAmount={customAmount}
              formError={formError}
              officeName={officeName}
              preset={preset}
              onCustomAmount={setCustomAmount}
              onPreset={setPreset}
              onSubmit={(event) => void startSetupIntent(event)}
              onClose={onClose}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AmountForm({
  amount,
  busy,
  customAmount,
  formError,
  officeName,
  preset,
  onCustomAmount,
  onPreset,
  onSubmit,
  onClose,
}: {
  amount: number;
  busy: boolean;
  customAmount: string;
  formError: string | null;
  officeName: string;
  preset: (typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom";
  onCustomAmount: (value: string) => void;
  onPreset: (value: (typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom") => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <p className="text-sm leading-6 text-zinc-400">
        Choose the amount to charge for {officeName} when a candidate files. That
        figure is locked in before the card is saved.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {QUICK_PLEDGE_AMOUNTS.map((value) => (
          <Button
            key={value}
            type="button"
            variant={preset === value ? "gold" : "outline"}
            size="sm"
            aria-pressed={preset === value}
            onClick={() => onPreset(value)}
          >
            {formatUsd(value)}
          </Button>
        ))}
        <Button
          type="button"
          variant={preset === "custom" ? "gold" : "outline"}
          size="sm"
          aria-pressed={preset === "custom"}
          onClick={() => onPreset("custom")}
        >
          Custom
        </Button>
      </div>

      {preset === "custom" ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Dollar amount
          </span>
          <input
            type="number"
            min="1"
            max={MAX_PLEDGE_AMOUNT}
            step="1"
            inputMode="decimal"
            autoFocus
            value={customAmount}
            onChange={(event) => onCustomAmount(event.target.value)}
            className="h-10 rounded-lg border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus:border-gold"
          />
        </label>
      ) : null}

      {formError ? (
        <p className="text-sm text-red-300" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" variant="gold" className="flex-1" disabled={busy}>
          {busy
            ? "Opening SetupIntent…"
            : `Continue with ${Number.isFinite(amount) ? formatUsd(amount) : ""}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function VaultCardForm({
  amount,
  electionId,
  officeName,
  setupIntentId,
  busy,
  formError,
  onBusy,
  onError,
  onVaulted,
  onBack,
  onClose,
}: {
  amount: number;
  electionId: string;
  officeName: string;
  setupIntentId: string;
  busy: boolean;
  formError: string | null;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onVaulted: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const consentId = useId();
  const [consent, setConsent] = useState(false);
  const formattedAmount = formatUsd(amount);

  async function confirmVault(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !stripe || !elements) return;

    if (!consent) {
      onError("Accept the off-session charge agreement before this card is vaulted.");
      return;
    }

    onBusy(true);
    onError(null);

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: window.location.href,
        },
      });
      if (error) throw new Error(error.message);
      if (setupIntent?.status !== "succeeded") {
        throw new Error("Stripe did not finish saving this card for a future charge.");
      }

      await recordEscrowVaultPledge({
        setupIntentId,
        electionId,
        pledgedAmount: amount,
        mandateAccepted: true,
        accessToken: await accessToken(),
      });
      onVaulted();
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Could not vault this conditional bounty.",
      );
    } finally {
      onBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void confirmVault(event)}>
      <div className="rounded-xl border border-gold/50 bg-zinc-950 px-4 py-4 text-sm leading-6 text-zinc-300">
        <p className="font-display text-base font-semibold text-parchment">
          Off-session charge agreement
        </p>
        <p className="mt-3">
          I give WHERE 2 RUN Conduit PAC permission to save this card and to initiate
          the payment on my behalf. I will not need to be online, and I will not be
          asked to approve the charge again.
        </p>
        <p className="mt-3">
          The charge is initiated when a candidate officially files for {officeName}.
          If no candidate files, this pledge is not captured.
        </p>
        <p className="mt-3">
          The amount charged is the pledged amount confirmed in this form,{" "}
          {formattedAmount}. That figure is fixed when the card is vaulted and is the
          only amount the platform may capture for this pledge.
        </p>
      </div>

      <label
        htmlFor={consentId}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-gold/40 bg-zinc-950 px-4 py-4"
      >
        <input
          id={consentId}
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            if (event.target.checked) onError(null);
          }}
          className="mt-1 h-4 w-4 accent-gold"
        />
        <span className="text-sm leading-6 text-parchment">
          I agree. WHERE 2 RUN may charge {formattedAmount} on my behalf when a
          candidate files for {officeName}.
        </span>
      </label>

      <PaymentElement options={{ layout: "tabs" }} />

      {formError ? (
        <p className="text-sm text-red-300" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="gold"
          className="flex-1"
          disabled={busy || !consent || !stripe || !elements}
        >
          {busy ? "Vaulting card…" : `Vault ${formattedAmount}`}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
