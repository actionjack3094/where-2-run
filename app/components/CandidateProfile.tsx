"use client";

import { useState } from "react";
import Link from "next/link";
import { pledgeFunds } from "@/app/actions/escrow/pledge-funds";
import { type EscrowStatus, officialDonationHref } from "@/lib/escrow/candidacy";

export type LockedCampaignTarget = {
  id: string;
  label: string;
  pledgedEscrow: number;
  escrowStatus: EscrowStatus;
  donationUrl: string | null;
};

export function CandidateProfile({
  candidateName,
  lockedTargets,
  viewingOwnProfile = false,
}: {
  candidateName: string;
  lockedTargets: LockedCampaignTarget[];
  viewingOwnProfile?: boolean;
}) {
  const [targetId, setTargetId] = useState(lockedTargets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState(() =>
    Object.fromEntries(lockedTargets.map((target) => [target.id, target.pledgedEscrow])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (lockedTargets.length === 0) return null;

  const selected = lockedTargets.find((target) => target.id === targetId) ?? lockedTargets[0];
  const pledged = balances[selected.id] ?? selected.pledgedEscrow;
  const donationHref = officialDonationHref(selected.donationUrl);
  const showPledge = !viewingOwnProfile && selected.escrowStatus === "accumulating";
  const showClaim = viewingOwnProfile && pledged > 0 && selected.escrowStatus === "accumulating";
  const showDonate = selected.escrowStatus === "released";

  async function pledge() {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await pledgeFunds(selected.id, dollars);
      setBalances((current) => ({ ...current, [selected.id]: result.pledgedEscrow }));
      setAmount("");
      setNotice(`Pledged $${dollars.toFixed(2)} to ${candidateName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not pledge those funds.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-brass/40 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-brass">
        Escrow wallet
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
        {showDonate ? "Donate" : "Escrow"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {candidateName} has locked {selected.label}. Escrow on this race is ${pledged.toFixed(2)}.
      </p>
      {selected.escrowStatus === "verification_pending" ? (
        <p className="mt-4 inline-flex rounded-full border border-yellow-400/40 bg-yellow-400/15 px-3 py-1 text-xs font-medium uppercase tracking-widest text-yellow-200">
          FEC/State Verification Pending
        </p>
      ) : null}
      {lockedTargets.length > 1 ? (
        <label className="mt-4 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Race
          <select
            value={selected.id}
            onChange={(event) => setTargetId(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-brass/40 bg-zinc-950 px-3 text-sm normal-case tracking-normal text-parchment"
          >
            {lockedTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showPledge || showDonate || showClaim ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          {showPledge ? (
            <>
              <label className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-brass/40 bg-zinc-950 px-3 text-sm normal-case tracking-normal text-parchment sm:w-36"
                />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => void pledge()}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal transition-colors hover:bg-brass-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Pledging…" : "Pledge to Campaign"}
              </button>
            </>
          ) : null}
          {showDonate && donationHref ? (
            <a
              href={donationHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal transition-colors hover:bg-brass-dark"
            >
              Donate
            </a>
          ) : null}
          {showClaim ? (
            <Link
              href="/claim"
              className="inline-flex h-10 items-center justify-center rounded-md border border-brass/50 px-4 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-brass hover:text-brass"
            >
              Claim Escrow
            </Link>
          ) : null}
        </div>
      ) : null}
      {selected.escrowStatus === "released" && !donationHref ? (
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          The official ActBlue or WinRed page is not on file yet.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-sm leading-6 text-brass" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
