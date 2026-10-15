"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { calibrateWedge } from "@/lib/actions/townhall-calibration";
import { factionTitle } from "@/lib/onboarding/diagnostic";
import {
  confidenceFill,
  CONFIDENCE_FLOOR,
  LIKERT_CHOICES,
  type LikertChoice,
  type WedgeCard,
} from "@/lib/townhall/calibration";
import { cn } from "@/lib/utils";

type Snapshot = {
  x: number;
  y: number;
  confidence: number;
  placed: boolean;
};

type Phase = "in" | "out";

const LEAVE_MS = 280;

function formatAxis(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toFixed(2);
  return rounded > 0 ? `+${text}` : text;
}

function motionMs() {
  if (typeof window === "undefined") return LEAVE_MS;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVE_MS;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function CalibrationLab({
  initial,
  cards,
  previouslyFiled,
}: {
  initial: Snapshot;
  cards: WedgeCard[];
  previouslyFiled: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>("in");
  const [busyChoice, setBusyChoice] = useState<LikertChoice | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filed, setFiled] = useState(previouslyFiled);
  const mounted = useRef(true);
  const lock = useRef(false);

  const card = cards[cursor] ?? null;
  const percent = Math.round(
    (Number.isFinite(snapshot.confidence) ? snapshot.confidence : CONFIDENCE_FLOOR) * 100,
  );
  const fill = confidenceFill(snapshot.confidence);
  const faction = snapshot.placed ? factionTitle(snapshot) : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function advance() {
    setPhase("out");
    await wait(motionMs());
    if (!mounted.current) return;
    setCursor((current) => current + 1);
    setPhase("in");
    setBusyChoice(null);
    lock.current = false;
  }

  async function answer(choice: LikertChoice) {
    if (!card || lock.current) return;
    lock.current = true;
    setBusyChoice(choice);
    setError(null);
    try {
      const next = await calibrateWedge({ questionId: card.id, choice });
      if (!mounted.current) return;
      setSnapshot({
        x: next.x,
        y: next.y,
        confidence: next.confidence,
        placed: next.placed,
      });
      if (next.toast) {
        setFiled(true);
        setToast(next.toast);
      }
      await advance();
    } catch (caught) {
      if (!mounted.current) return;
      setPhase("in");
      setBusyChoice(null);
      lock.current = false;
      setError(caught instanceof Error ? caught.message : "Could not file this topic.");
    }
  }

  async function skip() {
    if (!card || lock.current) return;
    lock.current = true;
    setBusyChoice("skip");
    setError(null);
    await advance();
  }

  return (
    <>
      <section
        aria-label="Your vector"
        className="mt-8 rounded-3xl border border-amber-500/40 bg-white px-6 py-6"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Faction</p>
        <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-900">
          {faction ?? "Vector not filed"}
        </p>
        <p className="mt-3 font-mono text-sm tabular-nums text-stone-700">
          {snapshot.placed
            ? `Economic ${formatAxis(snapshot.x)} · Social ${formatAxis(snapshot.y)}`
            : "Your first answer places you on the plane."}
        </p>
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">
              Ideological Confidence Score
            </p>
            <p className="text-sm font-semibold tabular-nums text-stone-900">{percent}%</p>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"
            role="meter"
            aria-label="Ideological Confidence Score"
            aria-valuemin={68}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(68, percent))}
            aria-valuetext={`${percent} percent`}
          >
            <div
              className="h-full rounded-full bg-amber-600 transition-[width] duration-500 ease-out"
              style={{ width: `${fill}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-widest text-stone-500">
            <span>68%</span>
            <span>100%</span>
          </div>
        </div>
      </section>

      <div className="mt-6 overflow-hidden">
        {card ? (
          <article
            key={card.id}
            aria-live="polite"
            className={cn(
              "rounded-2xl border border-amber-500/30 bg-white px-5 py-5",
              phase === "out" ? "townhall-card-out" : "townhall-card-in",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
              {card.context}
            </p>
            <h2 className="mt-3 font-display text-lg font-semibold leading-snug text-stone-900">
              {card.prompt}
            </h2>
            <div
              className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
              role="group"
              aria-label="Your position"
            >
              {LIKERT_CHOICES.map((choice) => {
                const pending = busyChoice === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={busyChoice != null}
                    onClick={() => void answer(choice.id)}
                    className={cn(
                      "inline-flex h-12 items-center justify-center rounded-md border px-2 text-center text-[11px] font-semibold uppercase tracking-widest transition-colors disabled:cursor-wait disabled:opacity-60",
                      pending
                        ? "border-amber-500 bg-amber-500 text-stone-950"
                        : "border-amber-500/40 bg-white text-stone-900 hover:border-amber-500 hover:bg-amber-50",
                    )}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void skip()}
              disabled={busyChoice != null}
              className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-md border border-stone-300 bg-stone-50 text-[11px] font-semibold uppercase tracking-widest text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-900 disabled:cursor-wait disabled:opacity-60"
            >
              Skip Topic
            </button>
            {error ? (
              <p className="mt-4 text-sm leading-6 text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
          </article>
        ) : (
          <article
            className={cn(
              "rounded-2xl border border-amber-500/30 bg-white px-5 py-6",
              phase === "out" ? "townhall-card-out" : "townhall-card-in",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
              Calibration pass
            </p>
            <h2 className="mt-3 font-display text-lg font-semibold text-stone-900">
              {filed ? "This pass is filed" : "This pass was skipped"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {filed
                ? "Townhall confidence stops at 96%. A live district debate can still close the rest."
                : "Skip Topic leaves the vector where it is. Come back when you want to move it."}
            </p>
            <Link
              href="/debates"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-stone-900 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-50"
            >
              Enter a district debate
            </Link>
          </article>
        )}
      </div>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
          <p
            role="status"
            className="rounded-full border border-amber-500/40 bg-white px-4 py-2 text-sm text-stone-800 shadow-lg"
          >
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
