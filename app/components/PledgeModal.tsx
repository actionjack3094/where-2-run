"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitPledge } from "@/lib/actions/pledges";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";

export const PLEDGE_AMOUNTS = [10, 25, 50] as const;

export type PledgeRaceOption = {
  electionId: string;
  label: string;
};

const DISCLAIMER =
  "Funds are held in escrow and only released if the candidate maintains a 10-debate ideological alignment streak.";

const TOAST_KEY = "pledge-support-toast";

export function PledgeSupportButton({
  candidateId,
  candidateName,
  races,
  signedIn,
}: {
  candidateId: string;
  candidateName: string;
  races: PledgeRaceOption[];
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TOAST_KEY);
    if (!saved) return;
    window.sessionStorage.removeItem(TOAST_KEY);
    setToast(saved);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <>
      <Button
        type="button"
        variant="gold"
        size="lg"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        Pledge Support
      </Button>
      {open ? (
        <PledgeModal
          candidateId={candidateId}
          candidateName={candidateName}
          races={races}
          signedIn={signedIn}
          onClose={() => setOpen(false)}
          onSuccess={(message) => {
            window.sessionStorage.setItem(TOAST_KEY, message);
            setOpen(false);
            setToast(message);
          }}
        />
      ) : null}
      {toast ? (
        <div role="status" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
          <p className="rounded-full border border-gold bg-zinc-950 px-4 py-2 text-sm text-gold shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}

export function PledgeModal({
  candidateId,
  candidateName,
  races,
  signedIn,
  onClose,
  onSuccess,
}: {
  candidateId: string;
  candidateName: string;
  races: PledgeRaceOption[];
  signedIn: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const titleId = useId();
  const selectId = useId();
  const router = useRouter();
  const [preset, setPreset] = useState<(typeof PLEDGE_AMOUNTS)[number] | "custom">(25);
  const [customAmount, setCustomAmount] = useState("25");
  const [electionId, setElectionId] = useState(races[0]?.electionId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!signedIn) {
      router.push(`/auth/login?next=/candidate/${candidateId}`);
      return;
    }
    if (!electionId) {
      setError("This campaign has not declared a race yet.");
      return;
    }
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
      const result = await submitPledge(candidateId, electionId, amount);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess(`Pledged ${formatUsd(result.amount)} to ${candidateName}.`);
    } catch {
      setError("We couldn't lock in that pledge. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-gold/50 bg-zinc-900 px-6 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
          Escrow pledge
        </p>
        <h2
          id={titleId}
          className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Pledge Support
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Back {candidateName} in escrow. Nothing moves until the alignment streak clears.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void confirm(event)}>
          {races.length > 1 ? (
            <label className="flex flex-col gap-2" htmlFor={selectId}>
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Race
              </span>
              <select
                id={selectId}
                value={electionId}
                onChange={(event) => setElectionId(event.target.value)}
                className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
              >
                {races.map((race) => (
                  <option key={race.electionId} value={race.electionId}>
                    {race.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLEDGE_AMOUNTS.map((value) => (
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
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
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
                className="h-12 rounded-md border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
              />
            </label>
          ) : null}

          <p className="text-sm leading-6 text-zinc-400">{DISCLAIMER}</p>

          {error ? (
            <p className="text-sm leading-6 text-rose-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" variant="gold" className="flex-1" disabled={busy}>
              {busy
                ? "Pledging…"
                : `Pledge ${Number.isFinite(amount) ? formatUsd(amount) : ""}`}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
