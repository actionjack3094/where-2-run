"use client";

import { useState } from "react";
import Link from "next/link";
import { PledgeModal } from "@/app/ballot/pledge-modal";
import type { VoterBallotCandidate } from "@/lib/elections/hub-types";

export function BallotCandidate({ candidate }: { candidate: VoterBallotCandidate }) {
  const [open, setOpen] = useState(false);

  function handleOpenEscrow() {
    setOpen(true);
  }

  return (
    <li className="border-t border-stone-200 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/candidates/${candidate.id}`} className="text-sm font-semibold text-stone-900 hover:text-amber-800">
          {candidate.name}
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
          {candidate.party} · {candidate.tierLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={() => handleOpenEscrow()}
        className="mt-3 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
      >
        Pledge Escrow
      </button>
      {open ? (
        <PledgeModal
          candidateId={candidate.id}
          candidateName={candidate.name}
          primaryId={candidate.primaryId}
          pledged={candidate.pledged}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </li>
  );
}
