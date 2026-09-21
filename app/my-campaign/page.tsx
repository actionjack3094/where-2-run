"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BallotRoadmap } from "@/components/campaign/BallotRoadmap";
import { MatchedElections } from "@/components/campaign/MatchedElections";
import { cn } from "@/lib/utils";

type Stance = "endorse" | "oppose" | "skip";

type PolicyQuestion = {
  id: string;
  topic: string;
  prompt: string;
};

const POLICY_QUESTIONS: PolicyQuestion[] = [
  {
    id: "zoning-transit",
    topic: "Land Use",
    prompt: "Should the city mandate high-density zoning near transit hubs?",
  },
  {
    id: "property-tax-freeze",
    topic: "Taxation",
    prompt:
      "Should the city freeze residential property-tax appraisals for long-term homeowners?",
  },
  {
    id: "civilian-traffic",
    topic: "Public Safety",
    prompt:
      "Should the city replace armed traffic stops with unarmed civilian enforcement?",
  },
  {
    id: "contractor-wage",
    topic: "Labor",
    prompt:
      "Should the city require a $20 living wage for every municipal contractor?",
  },
  {
    id: "short-term-rentals",
    topic: "Housing",
    prompt:
      "Should the city ban short-term rentals in single-family neighborhoods?",
  },
];

const EXIT_MS = 320;

function exitClass(stance: Stance | null) {
  if (stance === "endorse") return "translate-x-[120%] rotate-6 opacity-0";
  if (stance === "oppose") return "-translate-x-[120%] -rotate-6 opacity-0";
  if (stance === "skip") return "-translate-y-16 opacity-0";
  return "translate-x-0 translate-y-0 rotate-0 opacity-100";
}

export default function MyCampaignPage() {
  const [index, setIndex] = useState(0);
  const [exit, setExit] = useState<Stance | null>(null);
  const busy = useRef(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
    };
  }, []);

  const advance = useCallback((stance: Stance) => {
    if (busy.current) return;
    busy.current = true;
    setExit(stance);

    timer.current = window.setTimeout(() => {
      setIndex((current) => (current + 1) % POLICY_QUESTIONS.length);
      setExit(null);
      busy.current = false;
    }, EXIT_MS);
  }, []);

  const current = POLICY_QUESTIONS[index];
  const upcoming = POLICY_QUESTIONS[(index + 1) % POLICY_QUESTIONS.length];
  const animating = exit !== null;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col overflow-x-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-col px-6 py-10">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            My Campaign
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-parchment">
            Ideological Engine
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            One municipal question at a time. Endorse, oppose, or skip — the deck
            loops without end.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href="/onboarding/ideology"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Baseline Stance Quiz
            </Link>
            <Link
              href="/my-campaign/verify"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Verification Hub
            </Link>
            <Link
              href="/my-campaign/coalitions"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Coalition Hub
            </Link>
          </div>
        </header>

        <p className="mt-8 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Question {index + 1} of {POLICY_QUESTIONS.length}
        </p>

        <div className="relative mt-4">
          {animating ? (
            <article
              aria-hidden
              className="absolute inset-x-0 top-0 rounded-xl border border-gold/30 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold)]"
            >
              <p className="text-[11px] font-medium uppercase tracking-widest text-gold/70">
                {upcoming.topic}
              </p>
              <p className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
                {upcoming.prompt}
              </p>
              <p className="mt-6 text-sm leading-6 text-zinc-400">
                Record the stance your campaign will defend. Skipping leaves this
                plank unmarked and draws the next ordinance.
              </p>
            </article>
          ) : null}

          <article
            key={current.id}
            aria-live="polite"
            className={cn(
              "relative rounded-xl border border-gold/50 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-[transform,opacity] duration-300 ease-out",
              "motion-reduce:transition-none",
              exitClass(exit),
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              {current.topic}
            </p>
            <h2 className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
              {current.prompt}
            </h2>
            <p className="mt-6 text-sm leading-6 text-zinc-400">
              Record the stance your campaign will defend. Skipping leaves this
              plank unmarked and draws the next ordinance.
            </p>
          </article>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={animating}
            onClick={() => advance("oppose")}
            className="inline-flex h-12 items-center justify-center rounded-md border border-gold/50 bg-zinc-950 font-display text-sm font-semibold uppercase tracking-[0.18em] text-parchment transition-colors hover:border-gold hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50"
          >
            Oppose
          </button>
          <button
            type="button"
            disabled={animating}
            onClick={() => advance("endorse")}
            className="inline-flex h-12 items-center justify-center rounded-md bg-gold-strong font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold disabled:pointer-events-none disabled:opacity-50"
          >
            Endorse
          </button>
        </div>

        <button
          type="button"
          disabled={animating}
          onClick={() => advance("skip")}
          className="mt-4 inline-flex h-10 items-center justify-center text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400 transition-colors hover:text-parchment disabled:pointer-events-none disabled:opacity-50"
        >
          Skip / Next Question
        </button>
      </div>

      <section
        aria-label="Campaign management tools"
        className="mx-auto w-full max-w-5xl px-6 pb-16"
      >
        <div className="border-t border-gold/30 pt-12">
          <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Identity
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
                Verification & Civic Fencing
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Confirm a phone, match the voter file, then file a government ID for
                ballot access.
              </p>
            </div>
            <Link
              href="/my-campaign/verify"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-parchment transition-colors hover:border-gold hover:bg-zinc-900"
            >
              Open Verification Hub
            </Link>
          </div>
          <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Alliances
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
                Coalitions & Endorsements
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Charter a caucus and invite aligned campaigns across districts.
              </p>
            </div>
            <Link
              href="/my-campaign/coalitions"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold"
            >
              Open Coalition Hub
            </Link>
          </div>
          <BallotRoadmap />
          <MatchedElections />
        </div>
      </section>
    </main>
  );
}
