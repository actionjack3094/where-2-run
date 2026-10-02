"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initiateEscrowClaim } from "@/lib/actions/escrow";
import { type EscrowStatus, officialDonationHref } from "@/lib/escrow/candidacy";

export type ClaimTarget = {
  id: string;
  label: string;
  pledgedEscrow: number;
  escrowStatus: EscrowStatus;
  committeeName: string | null;
  officialCandidateId: string | null;
  donationUrl: string | null;
};

const FIELD_CLASS =
  "mt-2 h-10 w-full rounded-md border border-brass/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-brass/50";

export function ClaimForm({
  targets,
  initialTargetId,
}: {
  targets: ClaimTarget[];
  initialTargetId: string | null;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(
    targets.find((target) => target.id === initialTargetId)?.id ?? targets[0]?.id ?? "",
  );
  const [filing, setFiling] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = targets.find((target) => target.id === targetId) ?? targets[0];
  if (!selected) return null;

  const donationHref = officialDonationHref(selected.donationUrl);

  async function onSubmit() {
    if (!filing.trim()) {
      setError("Enter an FEC ID or a state registration link.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await initiateEscrowClaim(selected.id, filing);
      setFiling("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file that claim.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-brass/40 bg-zinc-900 px-5 py-5">
      {targets.length > 1 ? (
        <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Locked race
          <select
            value={selected.id}
            onChange={(event) => setTargetId(event.target.value)}
            className={FIELD_CLASS}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm leading-6 text-zinc-300">{selected.label}</p>
      )}
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        Escrow on this race is ${selected.pledgedEscrow.toFixed(2)}.
      </p>

      {selected.escrowStatus === "verification_pending" ? (
        <p className="mt-4 inline-flex rounded-full border border-yellow-400/40 bg-yellow-400/15 px-3 py-1 text-xs font-medium uppercase tracking-widest text-yellow-200">
          FEC/State Verification Pending
        </p>
      ) : null}

      {selected.escrowStatus === "verification_pending" && selected.committeeName ? (
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          {selected.committeeName}
          {selected.officialCandidateId ? ` · ${selected.officialCandidateId}` : ""} is in review.
        </p>
      ) : null}

      {selected.escrowStatus === "released" ? (
        <div className="mt-4">
          <p className="text-sm leading-6 text-zinc-300">
            This escrow has been released to the committee.
          </p>
          {donationHref ? (
            <a
              href={donationHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal hover:bg-brass-dark"
            >
              Donate
            </a>
          ) : null}
        </div>
      ) : null}

      {selected.escrowStatus === "accumulating" ? (
        <form
          className="mt-5 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <label className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            FEC ID or state registration link
            <input
              value={filing}
              onChange={(event) => setFiling(event.target.value)}
              placeholder="H0TX00123 or https://…"
              autoComplete="off"
              required
              className={FIELD_CLASS}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal transition-colors hover:bg-brass-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Filing claim…" : "Claim escrow"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      <Link
        href="/my-campaign"
        className="mt-6 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
      >
        Back to the war room
      </Link>
    </section>
  );
}
