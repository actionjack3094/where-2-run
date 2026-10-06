"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InfoTooltip, PLEDGED_ESCROW_TIP } from "@/components/InfoTooltip";
import { BackingBar } from "@/components/pledges/BackingBar";
import { pledgeWarChest } from "@/lib/actions/support";
import { formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";

export function PledgeFundsCard({
  candidateId,
  signedIn,
  chests,
}: {
  candidateId: string;
  signedIn: boolean;
  chests: { primaryId: string; label: string; amount: number; institutional?: number }[];
}) {
  const router = useRouter();
  const grassroots = chests.reduce((sum, chest) => sum + chest.amount, 0);
  const institutional = chests.reduce((sum, chest) => sum + (chest.institutional ?? 0), 0);
  const total = grassroots + institutional;
  const [primaryId, setPrimaryId] = useState(chests[0]?.primaryId ?? "");
  const [amount, setAmount] = useState("25");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-8 rounded-2xl border border-amber-500/30 bg-zinc-900 px-6 py-6">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
        Pledged Escrow
        <InfoTooltip label="Pledged Escrow" text={PLEDGED_ESCROW_TIP} />
      </p>
      <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-parchment">
        {formatUsd(total)}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Grassroots dollars and institutional backing stay on separate segments of the war chest.
      </p>
      <BackingBar grassroots={grassroots} institutional={institutional} />
      {chests.length > 1 ? (
        <ul className="mt-4 grid gap-1 text-sm text-zinc-300">
          {chests.map((chest) => (
            <li key={chest.primaryId}>
              {chest.label} · {formatUsd(chest.amount)}
            </li>
          ))}
        </ul>
      ) : null}
      {chests.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">This campaign has not opened a war chest yet.</p>
      ) : !signedIn ? (
        <Link
          href={`/auth/login?next=${encodeURIComponent(`/profile/${candidateId}`)}`}
          className="mt-5 inline-flex h-12 items-center justify-center rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950"
        >
          Pledge Funds
        </Link>
      ) : (
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setMessage(null);
            setError(null);
            void pledgeWarChest(candidateId, primaryId, Number(amount)).then((result) => {
              setPending(false);
              setMessage(result.message ?? null);
              setError(result.error ?? null);
              if (!result.error) router.refresh();
            });
          }}
        >
          {chests.length > 1 ? (
            <label className="grid gap-1 text-[11px] uppercase tracking-widest text-zinc-500">
              Race
              <select
                value={primaryId}
                onChange={(event) => setPrimaryId(event.target.value)}
                className="h-12 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm normal-case tracking-normal text-parchment"
              >
                {chests.map((chest) => (
                  <option key={chest.primaryId} value={chest.primaryId}>
                    {chest.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="sr-only">Race {chests[0]?.label}</span>
          )}
          <label className="grid gap-1 text-[11px] uppercase tracking-widest text-zinc-500">
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-12 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-parchment"
              aria-label="Pledge amount in dollars"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 disabled:opacity-60"
          >
            {pending ? "Pledging…" : "Pledge Funds"}
          </button>
          <p className="text-xs text-zinc-500 sm:col-span-3">Up to {formatUsd(MAX_PLEDGE_AMOUNT)} per pledge.</p>
          {message ? <p className="text-sm text-parchment sm:col-span-3">{message}</p> : null}
          {error ? <p className="text-sm text-zinc-300 sm:col-span-3">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
