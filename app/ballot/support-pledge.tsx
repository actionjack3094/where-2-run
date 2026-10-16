"use client";

import { useState } from "react";
import Link from "next/link";
import { PledgeModal } from "@/app/ballot/pledge-modal";

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
