"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createPledge } from "@/app/actions/stripe/create-pledge";
import { ensureArenaUser } from "@/lib/arena/identity";
import { splitBacking } from "@/lib/pledges/backing";
import { supabase } from "@/lib/db/supabase";
import {
  BALLOT_ACCESS_THRESHOLD,
  BALLOT_PLEDGE_TIERS,
  formatUsd,
  MAX_PLEDGE_AMOUNT,
} from "@/lib/pledges";
import { cn } from "@/lib/utils";

const ESCROW_DISCLOSURE =
  "Funds held in conditional escrow; automatically refunded if candidate does not meet the ballot qualification threshold.";

export function CampaignFinanceCard({
  candidateId,
  name,
  office,
  party,
  state,
  district,
  slug,
  grassroots,
  institutional,
  signedIn,
}: {
  candidateId: string;
  name: string;
  office: string;
  party: string;
  state: string;
  district: string | null;
  slug: string;
  grassroots: number;
  institutional: number;
  signedIn: boolean;
}) {
  const split = splitBacking(grassroots, institutional);
  const pledged = split.grassroots;
  const escrowPercent = Math.min(100, (pledged / BALLOT_ACCESS_THRESHOLD) * 100);
  const seat = district ? `${state}-${district}` : state;
  const [open, setOpen] = useState(false);

  return (
    <article className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
      <p className="text-[11px] uppercase tracking-widest text-stone-600">
        <Link href={`/elections/${slug}`} className="hover:text-amber-800">
          {office} · {seat}
        </Link>
        {" · "}
        {party}
      </p>
      <h2 className="mt-2 font-display text-xl text-stone-900">{name}</h2>

      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-600">
          War chest
        </p>
        <div
          className="mt-3 flex h-3 overflow-hidden rounded-full bg-stone-200"
          role="img"
          aria-label={`Grassroots ${Math.round(split.grassrootsShare * 100)} percent, institutional ${Math.round(split.institutionalShare * 100)} percent`}
        >
          <div className="h-full bg-gold" style={{ width: `${split.grassrootsShare * 100}%` }} />
          <div className="h-full bg-stone-400" style={{ width: `${split.institutionalShare * 100}%` }} />
        </div>
        <dl className="mt-3 grid gap-2 text-sm text-stone-900 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-stone-600">
              Grassroots small-dollar
            </dt>
            <dd className="mt-1 tabular-nums">
              {formatUsd(split.grassroots)}
              <span className="ml-2 text-stone-600">
                {Math.round(split.grassrootsShare * 100)}%
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-stone-600">
              Institutional / PAC
            </dt>
            <dd className="mt-1 tabular-nums">
              {formatUsd(split.institutional)}
              <span className="ml-2 text-stone-600">
                {Math.round(split.institutionalShare * 100)}%
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-800">
          Conditional escrow
        </p>
        <p className="mt-2 text-sm tabular-nums text-stone-900">
          {formatUsd(pledged)} pledged of {formatUsd(BALLOT_ACCESS_THRESHOLD)} ballot-access threshold
        </p>
        <div
          className="mt-3 h-3 overflow-hidden rounded-full bg-stone-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={BALLOT_ACCESS_THRESHOLD}
          aria-valuenow={Math.min(pledged, BALLOT_ACCESS_THRESHOLD)}
          aria-label="Escrow pool toward ballot-access threshold"
        >
          <div
            className={cn("h-full bg-gold", pledged === 0 && "opacity-40")}
            style={{ width: `${pledged > 0 ? Math.max(escrowPercent, 2) : 0}%` }}
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-600">{ESCROW_DISCLOSURE}</p>
        {signedIn ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900"
          >
            Pledge to Escrow
          </button>
        ) : (
          <Link href="/auth/login" className="mt-4 inline-flex text-xs uppercase tracking-widest text-amber-800">
            Sign in to pledge
          </Link>
        )}
      </div>

      {open ? (
        <EscrowPledgeModal
          candidateId={candidateId}
          candidateName={name}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </article>
  );
}

function EscrowPledgeModal({
  candidateId,
  candidateName,
  onClose,
}: {
  candidateId: string;
  candidateName: string;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<(typeof BALLOT_PLEDGE_TIERS)[number] | "custom">(15);
  const [customAmount, setCustomAmount] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = useMemo(() => {
    if (preset !== "custom") return preset;
    const parsed = Number(customAmount);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [customAmount, preset]);

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
    try {
      await ensureArenaUser();
      const session = await supabase.auth.getSession();
      const result = await createPledge({
        candidateId,
        amount,
        accessToken: session.data.session?.access_token ?? null,
      });
      window.location.assign(result.checkoutUrl);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "Could not open escrow.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="escrow-pledge-title"
        className="w-full max-w-md rounded-xl border border-gold bg-white px-5 py-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <p className="text-[11px] uppercase tracking-widest text-amber-800">Conditional escrow</p>
        <h3 id="escrow-pledge-title" className="mt-2 font-display text-2xl text-stone-900">
          Pledge to {candidateName}
        </h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">{ESCROW_DISCLOSURE}</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {BALLOT_PLEDGE_TIERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              onClick={() => setPreset(value)}
              className={cn(
                "rounded-md border px-2 py-2 text-sm tabular-nums",
                preset === value
                  ? "border-gold bg-gold text-stone-900"
                  : "border-stone-200 bg-stone-50 text-stone-900",
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
              preset === "custom"
                ? "border-gold bg-gold text-stone-900"
                : "border-stone-200 bg-stone-50 text-stone-900",
            )}
          >
            Custom
          </button>
        </div>
        {preset === "custom" ? (
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="text-xs uppercase tracking-widest text-stone-600">Custom amount</span>
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
        {error ? <p className="mt-3 text-sm text-stone-900">{error}</p> : null}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-60"
          >
            {busy ? "Opening escrow…" : `Pledge ${Number.isFinite(amount) ? formatUsd(amount) : ""}`}
          </button>
          <button type="button" onClick={onClose} className="text-xs uppercase tracking-widest text-stone-600">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
