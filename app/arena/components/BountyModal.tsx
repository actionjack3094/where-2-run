"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useId, useMemo, useState } from "react";
import { createSetupIntent } from "@/app/actions/escrow/create-setup-intent";
import { recordEscrowPledge } from "@/app/actions/escrow/record-pledge";
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
import {
  BOUNTY_UNLOCK_CONDITIONS,
  type BountyUnlockConditionId,
} from "@/lib/escrow";
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

export function BountyButton({
  candidateId,
  candidateName,
  electionId,
  className,
}: {
  candidateId: string;
  candidateName: string;
  electionId?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="gold"
        size="lg"
        className={cn("w-full shrink-0 sm:w-auto", className)}
        onClick={() => setOpen(true)}
      >
        Place bounty
      </Button>
      {open ? (
        <BountyModal
          candidateId={candidateId}
          candidateName={candidateName}
          electionId={electionId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function BountyModal({
  candidateId,
  candidateName,
  electionId,
  onClose,
}: {
  candidateId: string;
  candidateName: string;
  electionId?: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const stripe = browserStripe();
  const [preset, setPreset] = useState<(typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom">(
    50,
  );
  const [customAmount, setCustomAmount] = useState("20");
  const [unlockCondition, setUnlockCondition] =
    useState<BountyUnlockConditionId>("candidate_declares");
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
      const result = await createSetupIntent({
        candidateId,
        amount,
        unlockCondition,
        electionId,
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

  function resetCardStep() {
    setClientSecret(null);
    setSetupIntentId(null);
    setFormError(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-gold">
            SetupIntent escrow
          </p>
          <CardTitle id={titleId}>
            {vaulted
              ? `Bounty vaulted for ${candidateName}`
              : `Bounty — ${candidateName}`}
          </CardTitle>
          <CardDescription>
            {vaulted
              ? "The card is stored off-session. Nothing is charged until the trigger fires."
              : "Authorize a card now. Stripe captures later, off-session, when the trigger condition is met."}
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
              <BountyCardForm
                amount={amount}
                candidateId={candidateId}
                electionId={electionId}
                setupIntentId={setupIntentId}
                unlockCondition={unlockCondition}
                busy={busy}
                formError={formError}
                onBusy={setBusy}
                onError={setFormError}
                onVaulted={() => setVaulted(true)}
                onBack={resetCardStep}
                onClose={onClose}
              />
            </Elements>
          ) : (
            <BountyDetailsForm
              amount={amount}
              busy={busy}
              customAmount={customAmount}
              formError={formError}
              preset={preset}
              unlockCondition={unlockCondition}
              onCustomAmount={setCustomAmount}
              onPreset={setPreset}
              onUnlockCondition={setUnlockCondition}
              onSubmit={(event) => void startSetupIntent(event)}
              onClose={onClose}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BountyDetailsForm({
  amount,
  busy,
  customAmount,
  formError,
  preset,
  unlockCondition,
  onCustomAmount,
  onPreset,
  onUnlockCondition,
  onSubmit,
  onClose,
}: {
  amount: number;
  busy: boolean;
  customAmount: string;
  formError: string | null;
  preset: (typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom";
  unlockCondition: BountyUnlockConditionId;
  onCustomAmount: (value: string) => void;
  onPreset: (value: (typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom") => void;
  onUnlockCondition: (value: BountyUnlockConditionId) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
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

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Trigger condition
        </span>
        <select
          value={unlockCondition}
          onChange={(event) =>
            onUnlockCondition(event.target.value as BountyUnlockConditionId)
          }
          className="h-10 rounded-lg border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus:border-gold"
        >
          {BOUNTY_UNLOCK_CONDITIONS.map((condition) => (
            <option key={condition.id} value={condition.id}>
              {condition.label}
            </option>
          ))}
        </select>
      </label>

      {formError ? <p className="text-sm text-red-300">{formError}</p> : null}

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

function BountyCardForm({
  amount,
  candidateId,
  electionId,
  setupIntentId,
  unlockCondition,
  busy,
  formError,
  onBusy,
  onError,
  onVaulted,
  onBack,
  onClose,
}: {
  amount: number;
  candidateId: string;
  electionId?: string | null;
  setupIntentId: string;
  unlockCondition: BountyUnlockConditionId;
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

  async function confirmBounty(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !stripe || !elements) return;

    onBusy(true);
    onError(null);

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/arena`,
        },
      });
      if (error) throw new Error(error.message);
      if (setupIntent?.status !== "succeeded") {
        throw new Error("Stripe did not finish vaulting this card.");
      }

      await recordEscrowPledge({
        setupIntentId,
        candidateId,
        amount,
        unlockCondition,
        electionId,
        accessToken: await accessToken(),
      });
      onVaulted();
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : "Could not vault this bounty.",
      );
    } finally {
      onBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void confirmBounty(event)}>
      <p className="text-sm leading-6 text-zinc-400">
        Vault {formatUsd(amount)} until the trigger fires. The platform can capture
        later while you are off-session.
      </p>
      <PaymentElement options={{ layout: "tabs" }} />
      {formError ? <p className="text-sm text-red-300">{formError}</p> : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="gold"
          className="flex-1"
          disabled={busy || !stripe || !elements}
        >
          {busy ? "Vaulting card…" : `Vault ${formatUsd(amount)}`}
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
