"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideInstitutionalPledge } from "@/lib/actions/institutional";
import { formatUsd } from "@/lib/pledges";

export function PledgeDecisions({
  pledges,
}: {
  pledges: { id: string; entityName: string; amount: number }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (pledges.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-amber-500/30 bg-white px-6 py-6">
      <h2 className="font-display text-xl text-stone-900">Institutional pledges</h2>
      <ul className="mt-4 grid gap-4">
        {pledges.map((pledge) => (
          <li key={pledge.id} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-700">
              {formatUsd(pledge.amount)} from {pledge.entityName}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending != null}
                onClick={() => {
                  setPending(pledge.id);
                  setError(null);
                  void decideInstitutionalPledge(pledge.id, "accepted").then((result) => {
                    setPending(null);
                    if (result.error) setError(result.error);
                    else router.refresh();
                  });
                }}
                className="rounded-md bg-gold-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={pending != null}
                onClick={() => {
                  setPending(pledge.id);
                  setError(null);
                  void decideInstitutionalPledge(pledge.id, "rejected").then((result) => {
                    setPending(null);
                    if (result.error) setError(result.error);
                    else router.refresh();
                  });
                }}
                className="rounded-md border border-amber-500/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-stone-600">{error}</p> : null}
    </section>
  );
}
