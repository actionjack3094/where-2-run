"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitJuryVerdict } from "@/lib/actions/jury-appeals";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/db/supabase";
import type { JuryDeskEligibility } from "@/lib/jury-desk";

export function JuryVerdictPanel({
  appealId,
  eligibility,
  ownVerdict,
  status,
  verdicts,
  overturnedVotes,
  quorum,
}: {
  appealId: string;
  eligibility: JuryDeskEligibility;
  ownVerdict: boolean | null;
  status: string;
  verdicts: number;
  overturnedVotes: number;
  quorum: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(overturned: boolean) {
    if (pending || !eligibility.canVote) return;
    setError(null);
    startTransition(async () => {
      const { data } = await supabase.auth.getSession();
      const result = await submitJuryVerdict(
        appealId,
        overturned,
        data.session?.access_token ?? null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const closed = status !== "pending";
  const locked = !eligibility.canVote || pending || closed;

  return (
    <section className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
        Adjudication
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold text-parchment">
        Cast your verdict
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {verdicts} of {quorum} constituent verdicts are in
        {verdicts > 0 ? ` (${overturnedVotes} to overturn)` : ""}. A majority of three
        jurors overturns the recorded winner.
      </p>

      {closed ? (
        <p className="mt-4 text-sm font-medium text-gold">
          {status === "overturned"
            ? "The jury overturned this outcome."
            : status === "upheld"
              ? "The jury sustained this outcome."
              : "This appeal is closed."}
        </p>
      ) : ownVerdict !== null ? (
        <p className="mt-4 text-sm text-parchment">
          You voted to {ownVerdict ? "overturn" : "sustain"} this result.
        </p>
      ) : !eligibility.canVote ? (
        <div className="mt-4 rounded-lg border border-gold/30 bg-zinc-950/70 px-4 py-3">
          <p className="text-sm font-medium text-gold">Not eligible to serve</p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">{eligibility.reason}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="gold"
          className="flex-1"
          disabled={locked}
          onClick={() => vote(true)}
        >
          {pending ? "Recording…" : "Overturn Result"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={locked}
          onClick={() => vote(false)}
        >
          Sustain Result
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm leading-6 text-red-300">{error}</p> : null}
    </section>
  );
}
