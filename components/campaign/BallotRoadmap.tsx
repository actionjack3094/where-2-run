"use client";

import { useEffect, useState } from "react";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";

type MilestoneId = "form-501" | "signatures" | "escrow";

type Milestone = {
  id: MilestoneId;
  step: string;
  title: string;
  detail: string;
};

const MILESTONES: Milestone[] = [
  {
    id: "form-501",
    step: "01",
    title: "File Campaign Intent (Form 501)",
    detail: "Declare for office with the municipal clerk so the race can print your name.",
  },
  {
    id: "signatures",
    step: "02",
    title: "Primary Signature Gathering / Filing Fee",
    detail: "Qualify for the primary by petition or by paying the statutory filing fee.",
  },
  {
    id: "escrow",
    step: "03",
    title: "Unlock Grassroots Escrow",
    detail: "Release pledged support once you are ballot-qualified and the race is live.",
  },
];

function parseCompleted(raw: string | null): MilestoneId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is MilestoneId =>
      MILESTONES.some((milestone) => milestone.id === id),
    );
  } catch {
    return [];
  }
}

function ProgressRing({
  complete,
  locked,
}: {
  complete: boolean;
  locked: boolean;
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className={cn(
        "relative inline-flex h-11 w-11 shrink-0 items-center justify-center",
        locked && "opacity-40",
      )}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          className="text-zinc-700"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={complete ? 0 : circumference}
          className="text-gold-strong transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 m-auto flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
          complete
            ? "border-gold-strong bg-gold-strong text-zinc-950"
            : "border-gold/40 bg-zinc-950 text-gold",
        )}
      >
        {complete ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path
              d="M3.5 8.2 6.4 11l6.1-6.4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </span>
  );
}

export function BallotRoadmap() {
  const [completed, setCompleted] = useState<MilestoneId[]>([]);

  useEffect(() => {
    setCompleted(
      parseCompleted(window.sessionStorage.getItem(STORAGE_KEYS.ballotRoadmap)),
    );
  }, []);

  function persist(next: MilestoneId[]) {
    setCompleted(next);
    window.sessionStorage.setItem(
      STORAGE_KEYS.ballotRoadmap,
      JSON.stringify(next),
    );
  }

  function toggle(id: MilestoneId) {
    const index = MILESTONES.findIndex((milestone) => milestone.id === id);
    const alreadyDone = completed.includes(id);
    const priorComplete = MILESTONES.slice(0, index).every((milestone) =>
      completed.includes(milestone.id),
    );

    if (alreadyDone) {
      persist(
        completed.filter((entry) => {
          const entryIndex = MILESTONES.findIndex(
            (milestone) => milestone.id === entry,
          );
          return entryIndex < index;
        }),
      );
      return;
    }

    if (!priorComplete) return;
    persist([...completed, id]);
  }

  const doneCount = completed.length;
  const total = MILESTONES.length;
  const overallOffset =
    2 * Math.PI * 18 * (1 - doneCount / Math.max(1, total));

  return (
    <section aria-labelledby="ballot-roadmap-heading">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Campaign Tools
          </p>
          <h2
            id="ballot-roadmap-heading"
            className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment"
          >
            Ballot Access Roadmap
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Three filings stand between a declared campaign and a printed ballot.
            Mark each milestone as the clerk records it.
          </p>
        </header>

        <div className="flex items-center gap-3 self-start rounded-xl border border-gold/40 bg-zinc-900 px-4 py-3 sm:self-auto">
          <span className="relative inline-flex h-12 w-12 items-center justify-center">
            <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90" aria-hidden>
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-zinc-700"
              />
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={overallOffset}
                className="text-gold-strong transition-[stroke-dashoffset] duration-500 ease-out"
              />
            </svg>
            <span className="absolute font-display text-xs font-semibold tabular-nums text-parchment">
              {doneCount}/{total}
            </span>
          </span>
          <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
            {doneCount === total ? "Ballot ready" : "Milestones filed"}
          </p>
        </div>
      </div>

      <ol className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {MILESTONES.map((milestone, index) => {
          const complete = completed.includes(milestone.id);
          const locked = MILESTONES.slice(0, index).some(
            (prior) => !completed.includes(prior.id),
          );

          return (
            <li key={milestone.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={complete}
                aria-disabled={locked}
                onClick={() => toggle(milestone.id)}
                className={cn(
                  "flex h-full w-full items-start gap-4 rounded-xl border bg-zinc-900 p-5 text-left shadow-[inset_3px_0_0_0_var(--gold)] transition-colors",
                  complete
                    ? "border-gold bg-zinc-900"
                    : "border-gold/50 hover:border-gold",
                  locked && "cursor-not-allowed opacity-60 hover:border-gold/50",
                )}
              >
                <ProgressRing complete={complete} locked={locked} />
                <span className="min-w-0">
                  <span className="text-[11px] font-medium uppercase tracking-widest text-gold">
                    Step {milestone.step}
                    {complete ? " · Filed" : locked ? " · Locked" : ""}
                  </span>
                  <span className="mt-2 block font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                    {milestone.title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-zinc-400">
                    {milestone.detail}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
