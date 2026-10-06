"use client";

import { useState } from "react";
import Link from "next/link";
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
        <p className="text-sm text-zinc-400">Austin and Texas seats in this demo field.</p>
        <div role="group" aria-label="Rank leaderboard by" className="flex rounded-full border border-gold/40 p-1">
          {(
            [
              ["civic", "Civic Standing"],
              ["chest", "War Chest"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={rankBy === id}
              onClick={() => setRankBy(id)}
              className={cn(
                "h-9 rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
                rankBy === id ? "bg-gold-strong text-zinc-950" : "text-zinc-400 hover:text-parchment",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {ordered.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-zinc-400">
          The Austin field appears here after the demo seed.
        </p>
      ) : (
        <ol className="mt-6 divide-y divide-gold/20 overflow-hidden rounded-xl border border-gold/40 bg-zinc-900">
          {ordered.map((row, index) => (
            <li key={row.id}>
              <Link
                href={`/profile/${row.userId}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-950"
              >
                <span className="w-8 font-display text-lg font-semibold tabular-nums text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <CandidateAvatar name={row.name} avatarUrl={row.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold text-parchment">{row.name}</span>
                  <span className="mt-1 block text-[11px] uppercase tracking-widest text-zinc-500">{row.race}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[11px] uppercase tracking-widest text-zinc-500">Civic Standing</span>
                  <span className="font-display text-lg tabular-nums text-parchment">
                    {row.civicStanding.toLocaleString("en-US")}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[11px] uppercase tracking-widest text-zinc-500">War Chest</span>
                  <span className="font-display text-lg tabular-nums text-gold">{formatUsd(row.warChest)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
