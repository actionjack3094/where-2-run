"use client";

import { useState } from "react";
import Link from "next/link";
import { CIVIC_STANDING_TIP, InfoTooltip, PLEDGED_ESCROW_TIP } from "@/components/InfoTooltip";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import type { LeaderboardEntry } from "@/lib/elections/leaderboard";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

type RankBy = "civic" | "chest";

export function ElectionLeaderboard({ rows }: { rows: LeaderboardEntry[] }) {
  const [rankBy, setRankBy] = useState<RankBy>("civic");
  const ordered = [...rows].sort((a, b) => {
    const delta = rankBy === "civic" ? b.civicStanding - a.civicStanding : b.warChest - a.warChest;
    return delta || a.name.localeCompare(b.name);
  });

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">Austin and Texas seats in this demo field.</p>
        <div role="group" aria-label="Rank leaderboard by" className="flex rounded-full border border-amber-500/30 p-1">
          {(
            [
              ["civic", "Civic Standing"],
              ["chest", "Pledged Escrow"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={rankBy === id}
              onClick={() => setRankBy(id)}
              className={cn(
                "h-9 rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
                rankBy === id ? "bg-amber-500 text-stone-950" : "text-stone-500 hover:text-stone-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {ordered.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-stone-600">
          The Austin field appears here after the demo seed.
        </p>
      ) : (
        <ol className="mt-6 divide-y divide-amber-500/20 overflow-hidden rounded-xl border border-amber-500/30 bg-white">
          {ordered.map((row, index) => (
            <li key={row.id}>
              <Link
                href={`/profile/${row.userId}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-stone-50"
              >
                <span className="w-8 font-display text-lg font-semibold tabular-nums text-amber-700">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <CandidateAvatar name={row.name} avatarUrl={row.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-stone-900">{row.name}</span>
                  <span className="mt-1 block text-[11px] uppercase tracking-widest text-stone-500">{row.race}</span>
                </span>
                <span className="text-right">
                  <span className="inline-flex items-center justify-end gap-1 text-[11px] uppercase tracking-widest text-stone-500">
                    Civic Standing
                    <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
                  </span>
                  <span className="font-display text-lg tabular-nums text-stone-900">
                    {row.civicStanding.toLocaleString("en-US")}
                  </span>
                </span>
                <span className="text-right">
                  <span className="inline-flex items-center justify-end gap-1 text-[11px] uppercase tracking-widest text-stone-500">
                    Pledged Escrow
                    <InfoTooltip label="Pledged Escrow" text={PLEDGED_ESCROW_TIP} />
                  </span>
                  <span className="font-display text-lg tabular-nums text-amber-700">{formatUsd(row.warChest)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
