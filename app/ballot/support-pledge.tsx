"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pledgeWarChest } from "@/lib/actions/support";
import { BALLOT_ACCESS_THRESHOLD, BALLOT_PLEDGE_TIERS, formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";
import { cn } from "@/lib/utils";

const ESCROW_DISCLOSURE =
  "Funds held in conditional escrow; automatically refunded if the candidate does not meet the filing-fee goal.";

export function SupportPledgeButton({
  candidateId,
  candidateName,
  primaryId,
  pledged,
  signedIn,
}: {
  candidateId: string;
  candidateName: string;
  primaryId: string;
  pledged: number;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!signedIn) {
    return (
      <Link
        href="/auth/login?next=/ballot"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-stone-300 px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-700"
      >
        Support / Pledge
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-stone-300 px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-800 hover:border-amber-600"
      >
        Support / Pledge
      </button>
      {open ? (
        <PledgeModal
          candidateId={candidateId}
          candidateName={candidateName}
          primaryId={primaryId}
          pledged={pledged}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function PledgeModal({
  candidateId,
  candidateName,
  primaryId,
  pledged,
  onClose,
}: {
  candidateId: string;
  candidateName: string;
  primaryId: string;
  pledged: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pool, setPool] = useState(pledged);
  const [preset, setPreset] = useState<(typeof BALLOT_PLEDGE_TIERS)[number] | "custom">(15);
  const [customAmount, setCustomAmount] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<string | null>(null);
  const amount = useMemo(() => {
    if (preset !== "custom") return preset;
    const parsed = Number(customAmount);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [customAmount, preset]);
  const progress = Math.min(100, (pool / BALLOT_ACCESS_THRESHOLD) * 100);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
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
    const result = await pledgeWarChest(candidateId, primaryId, amount);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.pledged != null) setPool(result.pledged);
    setFiled(result.message ?? "Pledge filed.");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-pledge-title"
        className="w-full max-w-md rounded-xl border border-gold bg-white px-5 py-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <p className="text-[11px] uppercase tracking-widest text-amber-800">Conditional escrow</p>
        <h3
          id="support-pledge-title"
          className="mt-2 text-xl font-semibold text-stone-900"
          style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
        >
          Support {candidateName}
        </h3>
        <p className="mt-3 text-sm tabular-nums text-stone-900">
          {formatUsd(pool)} pledged of {formatUsd(BALLOT_ACCESS_THRESHOLD)} filing-fee goal
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={BALLOT_ACCESS_THRESHOLD}
          aria-valuenow={Math.min(pool, BALLOT_ACCESS_THRESHOLD)}
          aria-label="Escrow toward the filing-fee goal"
        >
          <div className="h-full bg-gold" style={{ width: `${pool > 0 ? Math.max(progress, 2) : 0}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-600">{ESCROW_DISCLOSURE}</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {BALLOT_PLEDGE_TIERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              onClick={() => setPreset(value)}
              className={cn(
                "rounded-md border px-2 py-2 text-sm tabular-nums",
                preset === value ? "border-gold bg-gold text-stone-900" : "border-stone-200 bg-stone-50 text-stone-900",
              )}
            >
              {formatUsd(value)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={preset === "custom"}
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-md border px-2 py-2 text-sm",
              preset === "custom" ? "border-gold bg-gold text-stone-900" : "border-stone-200 bg-stone-50 text-stone-900",
            )}
          >
            Custom
          </button>
        </div>
        {preset === "custom" ? (
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-widest text-stone-600">Pledge amount</span>
            <input
              type="number"
              min={1}
              max={MAX_PLEDGE_AMOUNT}
              step="1"
              value={customAmount}
              onChange={(event) => setCustomAmount(event.target.value)}
              className="h-10 rounded-lg border border-stone-200 bg-stone-50 px-3 outline-none focus:border-amber-700"
            />
          </label>
        ) : null}
        {error ? <p className="mt-3 text-sm text-stone-600">{error}</p> : null}
        {filed ? <p className="mt-3 text-sm text-stone-900">{filed}</p> : null}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-60"
          >
            {busy ? "Filing pledge…" : `Pledge ${Number.isFinite(amount) ? formatUsd(amount) : ""}`}
          </button>
          <button type="button" onClick={onClose} className="text-xs uppercase tracking-widest text-stone-600">
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
