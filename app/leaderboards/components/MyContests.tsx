"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { electionProfileHref } from "@/lib/election-links";
import {
  CONTEST_SORTS,
  sortContests,
  type ContestRow,
  type ContestSortId,
} from "@/lib/leaderboards/contests";
import { formatRecord } from "@/lib/leaderboard";
import { formatViabilityScore } from "@/lib/math/viability";
import { parseElo } from "@/lib/arena/elo";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

export function MyContests({
  contests,
  signedIn = true,
  error = null,
}: {
  contests: ContestRow[];
  signedIn?: boolean;
  error?: string | null;
}) {
  const [sort, setSort] = useState<ContestSortId>("primary");
  const rows = useMemo(() => sortContests(contests, sort), [contests, sort]);

  return (
    <section aria-labelledby="my-contests-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          Dashboard
        </p>
        <h2
          id="my-contests-heading"
          className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          My Contests
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Recommended races ranked by how well this campaign fits the seat. Open a
          row to drop into that race dossier.
        </p>
      </header>

      {error ? (
        <p className="mt-8 text-sm leading-6 text-zinc-400">
          Could not load these contests. {error}
        </p>
      ) : !signedIn ? (
        <div className="mt-8 space-y-4">
          <p className="text-sm leading-6 text-zinc-400">
            Sign in or file a campaign to see recommended races scored against
            your ideology vector.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-4 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-gold hover:bg-zinc-900"
          >
            Open onboarding
          </Link>
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Sort recommended races"
            className="mt-6 flex flex-wrap gap-2"
          >
            {CONTEST_SORTS.map((option) => {
              const active = option.id === sort;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSort(option.id)}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-full px-3.5 text-[11px] font-medium uppercase tracking-widest transition-colors",
                    active
                      ? "bg-gold-strong text-zinc-950"
                      : "border border-gold/40 text-zinc-400 hover:border-gold hover:text-parchment",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {rows.length === 0 ? (
            <p className="mt-8 text-sm leading-6 text-zinc-400">
              No recommended races yet. File a district or take a stance to open this
              board.
            </p>
          ) : (
            <ol className="mt-5 max-h-[70vh] divide-y divide-gold/20 overflow-y-auto overflow-x-hidden rounded-xl border border-gold/40 bg-zinc-900">
              {rows.map((contest) => (
                <li key={contest.electionId}>
                  <Link
                    href={electionProfileHref(contest.slug)}
                    className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-zinc-950 sm:flex-row sm:items-center"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-semibold tracking-tight text-parchment">
                        {contest.officeName}
                      </span>
                      <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                        {contest.historicalLean ?? "Lean unpublished"}
                        {contest.incumbentName
                          ? ` · Incumbent ${contest.incumbentName}`
                          : " · Open or unpublished incumbent"}
                      </span>
                    </span>
                    <span className="grid grid-cols-2 gap-4 sm:flex sm:shrink-0 sm:items-stretch sm:gap-6">
                      <Stat
                        label="Record"
                        value={formatRecord(contest.wins, contest.losses)}
                      />
                      <Stat label="ELO" value={String(parseElo(contest.eloRating))} />
                      <Stat
                        label="Viability"
                        value={formatViabilityScore(contest.draftViability)}
                        accent
                      />
                      <Stat
                        label="Uncaptured bounty"
                        value={formatUsd(contest.uncapturedBounty)}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="min-w-[5.5rem] sm:text-right">
      <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span
        className={
          accent
            ? "mt-1 block font-display text-lg font-semibold tabular-nums text-gold"
            : "mt-1 block font-display text-lg font-semibold tabular-nums text-parchment"
        }
      >
        {value}
      </span>
    </span>
  );
}
