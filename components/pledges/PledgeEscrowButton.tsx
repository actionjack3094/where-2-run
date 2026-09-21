"use client";

import { useMemo, useState } from "react";
import { createPledge } from "@/app/actions/stripe/create-pledge";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import {
  formatUsd,
  MAX_PLEDGE_AMOUNT,
  QUICK_PLEDGE_AMOUNTS,
} from "@/lib/pledges";
import { cn } from "@/lib/utils";

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function PledgeEscrowButton({
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
  const [preset, setPreset] = useState<(typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom">(
    50,
  );
  const [customAmount, setCustomAmount] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => {
    if (preset !== "custom") return preset;
    const parsed = Number(customAmount);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [customAmount, preset]);

  async function startCheckout(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      setError(`Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await ensureArenaUser();
      const result = await createPledge({
        candidateId,
        amount,
        electionId,
        accessToken: await accessToken(),
      });
      window.location.assign(result.checkoutUrl);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "Could not start escrow checkout.");
    }
  }

  return (
    <div className={cn("w-full max-w-sm", className)}>
      {open ? (
        <form
          className="rounded-xl border border-gold/50 bg-zinc-900 p-5"
          onSubmit={(event) => void startCheckout(event)}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-gold">
            Conditional escrow
          </p>
          <p className="mt-2 font-display text-base font-semibold tracking-tight text-parchment">
            Pledge {candidateName}
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Vault a card now. Nothing is charged until this campaign files.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {QUICK_PLEDGE_AMOUNTS.map((value) => (
              <Button
                key={value}
                type="button"
                variant={preset === value ? "gold" : "outline"}
                size="sm"
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {formatUsd(value)}
              </Button>
            ))}
            <Button
              type="button"
              variant={preset === "custom" ? "gold" : "outline"}
              size="sm"
              aria-pressed={preset === "custom"}
              onClick={() => setPreset("custom")}
            >
              Custom
            </Button>
          </div>

          {preset === "custom" ? (
            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Custom amount
              </span>
              <input
                type="number"
                min="1"
                max={MAX_PLEDGE_AMOUNT}
                step="1"
                inputMode="decimal"
                autoFocus
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                className="h-10 rounded-lg border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus:border-gold"
              />
            </label>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

          <div className="mt-4 flex gap-2">
            <Button type="submit" variant="gold" className="flex-1" disabled={busy}>
              {busy
                ? "Opening Stripe…"
                : `Vault ${Number.isFinite(amount) ? formatUsd(amount) : ""} card`}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="gold"
          size="lg"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => setOpen(true)}
        >
          Pledge escrow
        </Button>
      )}
    </div>
  );
}
