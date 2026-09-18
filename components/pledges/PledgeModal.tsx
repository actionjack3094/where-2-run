"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createOptimisticPledge,
  formatUsd,
  MAX_PLEDGE_AMOUNT,
  QUICK_PLEDGE_AMOUNTS,
  submitPledge,
} from "@/lib/pledges";
import { cn } from "@/lib/utils";
import type { Pledge } from "@/types/database.types";

export type PledgeTarget = {
  candidateId: string;
  candidateName: string;
  onOptimistic?: (pledge: Pledge) => void;
  onCommitted?: (tempId: string, pledge: Pledge) => void;
  onFailed?: (tempId: string) => void;
};

export function PledgeModal({
  target,
  onClose,
  onConfirmed,
}: {
  target: PledgeTarget;
  onClose: () => void;
  onConfirmed: (message: string) => void;
}) {
  const titleId = useId();
  const [preset, setPreset] = useState<(typeof QUICK_PLEDGE_AMOUNTS)[number] | "custom">(
    QUICK_PLEDGE_AMOUNTS[1],
  );
  const [customAmount, setCustomAmount] = useState("20");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = useMemo(() => {
    if (preset !== "custom") return preset;
    const parsed = Number(customAmount);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [customAmount, preset]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      setFormError(`Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.`);
      return;
    }

    setBusy(true);
    setFormError(null);

    const optimistic = createOptimisticPledge({
      candidateId: target.candidateId,
      amount,
      message,
    });

    target.onOptimistic?.(optimistic);
    onClose();
    onConfirmed(`You're backing ${target.candidateName} with ${formatUsd(amount)}.`);

    try {
      const saved = await submitPledge({
        candidateId: target.candidateId,
        amount,
        message,
      });
      target.onCommitted?.(optimistic.id, saved);
    } catch (error) {
      target.onFailed?.(optimistic.id);
      onConfirmed(
        error instanceof Error ? error.message : "Checkout failed. The pledge was not recorded.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Mock checkout
          </p>
          <CardTitle id={titleId}>Back {target.candidateName}</CardTitle>
          <CardDescription>
            Simulated Stripe confirmation. No card is charged. Your pledge lands on the campaign
            instantly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleConfirm(event)}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {QUICK_PLEDGE_AMOUNTS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={preset === value ? "default" : "outline"}
                  size="sm"
                  aria-pressed={preset === value}
                  onClick={() => setPreset(value)}
                >
                  {formatUsd(value)}
                </Button>
              ))}
              <Button
                type="button"
                variant={preset === "custom" ? "default" : "outline"}
                size="sm"
                aria-pressed={preset === "custom"}
                onClick={() => setPreset("custom")}
              >
                Custom
              </Button>
            </div>

            {preset === "custom" && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
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
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                Endorsement note
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                maxLength={280}
                placeholder="Optional note the campaign can show on the floor…"
                className="resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
              />
            </label>

            {formError && <p className="text-sm text-zinc-600 dark:text-zinc-300">{formError}</p>}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? "Confirming…" : `Confirm ${Number.isFinite(amount) ? formatUsd(amount) : ""} pledge`}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
            <p
              className={cn(
                "text-center text-[11px] uppercase tracking-widest text-zinc-400",
              )}
            >
              One-click mock checkout
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
