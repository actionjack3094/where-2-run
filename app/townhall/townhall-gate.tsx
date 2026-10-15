"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileTownhall, recordTownhallCard } from "@/lib/actions/townhall";
import {
  TOWNHALL_BASELINE,
  TOWNHALL_DECK,
  TOWNHALL_WEIGHTS,
  TOWNHALL_WEIGHT_LABELS,
  type TownhallAnswer,
  type TownhallId,
  type TownhallWeight,
} from "@/lib/onboarding/townhall";
import { cn } from "@/lib/utils";

type Draft = {
  score: number;
  weight: TownhallWeight | null;
};

type Phase = "baseline" | "deck";

function initialDrafts(saved: TownhallAnswer[] | null): Record<TownhallId, Draft> {
  const drafts = Object.fromEntries(
    TOWNHALL_BASELINE.map((item) => [item.id, { score: 0, weight: null }]),
  ) as Record<TownhallId, Draft>;
  for (const answer of saved ?? []) {
    if (drafts[answer.id]) drafts[answer.id] = { score: answer.score, weight: answer.weight };
  }
  return drafts;
}

export function TownhallGate({ saved }: { saved: TownhallAnswer[] | null }) {
  const [phase, setPhase] = useState<Phase>(saved ? "deck" : "baseline");
  const [step, setStep] = useState(0);
  const [deckIndex, setDeckIndex] = useState(0);
  const [drafts, setDrafts] = useState(() => initialDrafts(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const baseline = TOWNHALL_BASELINE[step];
  const card = TOWNHALL_DECK[deckIndex % TOWNHALL_DECK.length];

  function skipCard() {
    if (busy || phase !== "deck") return;
    setError(null);
    setDeckIndex((current) => current + 1);
  }

  async function fileBaseline() {
    if (busy) return;
    const missing = TOWNHALL_BASELINE.some((item) => drafts[item.id].weight == null);
    if (missing) {
      setError("Mark how much each statement matters before filing the Townhall.");
      return;
    }

    setBusy(true);
    setError(null);
    const answers = TOWNHALL_BASELINE.map((item) => ({
      id: item.id,
      score: drafts[item.id].score,
      weight: drafts[item.id].weight,
    }));

    try {
      await fileTownhall(answers);
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file the Townhall.");
    } finally {
      setBusy(false);
    }
  }

  async function answerCard(score: -1 | 1) {
    if (busy || !card) return;
    setBusy(true);
    setError(null);
    try {
      await recordTownhallCard({ id: card.id, score });
      setDeckIndex((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file this card.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "deck" && card) {
    return (
      <section className="mt-8" aria-labelledby="townhall-deck-heading">
        <p className="text-sm leading-6 text-stone-600">
          Your baseline is filed. Each card is one policy. Support or oppose to move
          your vector. Skip Question advances the deck and leaves the vector unchanged.
        </p>
        <p className="mt-6 text-[11px] font-medium uppercase tracking-widest text-stone-500">
          Card {deckIndex + 1}
        </p>
        <article
          key={`${card.id}-${deckIndex}`}
          aria-live="polite"
          className="mt-3 rounded-2xl border border-amber-500/30 bg-white px-5 py-5"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
            {card.topic}
          </p>
          <h2
            id="townhall-deck-heading"
            className="mt-3 font-display text-lg font-semibold leading-snug text-stone-900"
          >
            {card.prompt}
          </h2>
        </article>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void answerCard(-1)}
            className="inline-flex h-12 items-center justify-center rounded-md border border-amber-500/40 bg-white text-[11px] font-semibold uppercase tracking-widest text-stone-900 transition-colors hover:border-amber-500 disabled:cursor-wait disabled:opacity-60"
          >
            Oppose
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void answerCard(1)}
            className="inline-flex h-12 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold uppercase tracking-widest text-stone-50 transition-colors hover:bg-stone-800 disabled:cursor-wait disabled:opacity-60"
          >
            Support
          </button>
        </div>
        <button
          type="button"
          onClick={skipCard}
          disabled={busy}
          className="mt-3 inline-flex h-14 w-full items-center justify-center rounded-md bg-amber-500 text-sm font-semibold uppercase tracking-[0.18em] text-stone-950 transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
        >
          Skip Question
        </button>
        {error ? (
          <p className="mt-4 text-sm leading-6 text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  if (!baseline) return null;
  const draft = drafts[baseline.id];
  const last = step === TOWNHALL_BASELINE.length - 1;

  return (
    <section className="mt-8" aria-labelledby="townhall-baseline-heading">
      <p className="text-sm leading-6 text-stone-600">
        Question {step + 1} of {TOWNHALL_BASELINE.length}. These four statements set
        your vector. Each one needs a position and a weight before the deck opens.
      </p>
      <article className="mt-6 rounded-2xl border border-amber-500/30 bg-white px-5 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
          Baseline {step + 1}
        </p>
        <h2
          id="townhall-baseline-heading"
          className="mt-3 font-display text-lg font-semibold leading-snug text-stone-900"
        >
          {baseline.statement}
        </h2>
        <div className="mt-5 flex items-center justify-between text-[11px] font-medium uppercase tracking-widest text-stone-500">
          <span>Strongly Oppose</span>
          <span>Strongly Support</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={Math.round(draft.score * 100)}
          aria-label={baseline.statement}
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={draft.score}
          aria-valuetext={draft.score < 0 ? "Oppose" : draft.score > 0 ? "Support" : "Neutral"}
          disabled={busy}
          onChange={(event) => {
            const score = Number(event.target.value) / 100;
            setDrafts((current) => ({
              ...current,
              [baseline.id]: { ...current[baseline.id], score },
            }));
          }}
          className="townhall-slider mt-3"
        />
        <div
          role="radiogroup"
          aria-label={`Importance of baseline question ${step + 1}`}
          className="mt-4 flex flex-wrap gap-2"
        >
          {TOWNHALL_WEIGHTS.map((weight) => {
            const selected = draft.weight === weight;
            return (
              <button
                key={weight}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setDrafts((current) => ({
                    ...current,
                    [baseline.id]: { ...current[baseline.id], weight },
                  }));
                }}
                className={cn(
                  "h-9 rounded-full border px-3 text-[11px] font-medium uppercase tracking-widest transition-colors",
                  selected
                    ? "border-amber-500 bg-amber-500 text-stone-950"
                    : "border-amber-500/30 bg-stone-50 text-stone-600 hover:border-amber-500/60 hover:text-stone-900",
                )}
              >
                {TOWNHALL_WEIGHT_LABELS[weight]}
              </button>
            );
          })}
        </div>
      </article>

      {error ? (
        <p className="mt-4 text-sm leading-6 text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-3">
        {step > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setStep((current) => Math.max(0, current - 1));
            }}
            className="inline-flex h-12 items-center justify-center rounded-md border border-amber-500/40 bg-white px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (draft.weight == null) {
              setError("Mark how much this statement matters before continuing.");
              return;
            }
            setError(null);
            if (!last) {
              setStep((current) => current + 1);
              return;
            }
            void fileBaseline();
          }}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-amber-500 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-950 transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Filing Townhall…" : last ? "See your matches" : "Next question"}
        </button>
      </div>
    </section>
  );
}
