"use client";

import { useState } from "react";
import { EscrowPledgeModal } from "@/components/escrow/EscrowPledgeModal";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { getPrimaryTier } from "@/lib/arena-rank";
import type { AccountProfile } from "@/types/database.types";

const TX10_PRIMARY_RANK = 4;
const TX10_ARENA_RATING = 1340;

function money(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

function axis(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

export function CandidateProfile({ candidate }: { candidate: AccountProfile }) {
  const [isEscrowModalOpen, setIsEscrowModalOpen] = useState(false);
  const name = candidate.full_name?.trim() || "Unnamed candidate";
  const pledged = Number(candidate.escrow_pledged ?? 0) || 0;
  const target = Number(candidate.escrow_target ?? 0) || 0;
  const progress = target > 0 ? Math.min(100, Math.round((pledged / target) * 100)) : 0;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
        <article className="rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
          <header className="flex items-center gap-3">
            <CandidateAvatar name={name} size="md" />
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{name}</h1>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-stone-500">
                {[candidate.party, candidate.office].filter(Boolean).join(" · ") || "Primary candidate"}
              </p>
            </div>
          </header>
          {candidate.candidate_stage ? (
            <p className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
              {candidate.candidate_stage}
            </p>
          ) : null}
          <dl className="mt-6 grid gap-4 text-sm">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Ideology</dt>
              <dd className="mt-1 text-stone-800">
                Economic {axis(candidate.ideology_x)} · Social {axis(candidate.ideology_y)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
                TX-10 Primary Rank
              </dt>
              <dd className="mt-1 text-stone-800">
                #{TX10_PRIMARY_RANK} {getPrimaryTier(TX10_ARENA_RATING)} ·{" "}
                {TX10_ARENA_RATING.toLocaleString("en-US")} AR
                <p className="text-xs text-stone-500 mt-0.5">
                  92% Ideological Correlation · Statutory Filing Escrow Unlocked
                </p>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Filing escrow</dt>
              <dd className="mt-1 text-stone-800">
                {money(pledged)} pledged of {money(target)}
              </dd>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-amber-600" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setIsEscrowModalOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isEscrowModalOpen}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Pledge Escrow
          </button>
        </article>
      </div>
      <EscrowPledgeModal
        isOpen={isEscrowModalOpen}
        onClose={() => setIsEscrowModalOpen(false)}
        candidateName={name}
      />
    </main>
  );
}
