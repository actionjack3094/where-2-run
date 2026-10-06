"use client";

import { useState } from "react";
import { fileTownhall } from "@/lib/actions/townhall";
import {
  TOWNHALL_STATEMENTS,
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

function isRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}

function initialDrafts(saved: TownhallAnswer[] | null): Record<TownhallId, Draft> {
  const drafts = Object.fromEntries(
    TOWNHALL_STATEMENTS.map((item) => [item.id, { score: 0, weight: null }]),
  ) as Record<TownhallId, Draft>;
  for (const answer of saved ?? []) {
    drafts[answer.id] = { score: answer.score, weight: answer.weight };
  }
  return drafts;
}

export function TownhallGate({ saved }: { saved: TownhallAnswer[] | null }) {
  const [drafts, setDrafts] = useState(() => initialDrafts(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const missing = TOWNHALL_STATEMENTS.some((item) => drafts[item.id].weight == null);
    if (missing) {
      setError("Mark how much each statement matters before filing the Townhall.");
      return;
    }

    setBusy(true);
    setError(null);
    const answers = TOWNHALL_STATEMENTS.map((item) => ({
      id: item.id,
      score: drafts[item.id].score,
      weight: drafts[item.id].weight,
    }));

    try {
      await fileTownhall(answers);
    } catch (caught) {
      if (isRedirectError(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "Could not file the Townhall.");
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-8 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {saved ? (
        <p className="text-sm leading-6 text-stone-600">
          Your Townhall is on file. Move a slider or a weight to update the baseline.
        </p>
      ) : (
        <p className="text-sm leading-6 text-stone-600">
          Five statements set your baseline. Slide each one from Strongly Oppose to Strongly
          Support, then mark how much it matters.
        </p>
      )}

      <ol className="grid gap-4">
        {TOWNHALL_STATEMENTS.map((item, index) => {
          const draft = drafts[item.id];
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-amber-500/30 bg-white px-5 py-5"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
                Statement {index + 1}
              </p>
              <p className="mt-3 font-display text-lg font-semibold leading-snug text-stone-900">
                {item.statement}
              </p>
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
                aria-label={item.statement}
                aria-valuemin={-1}
                aria-valuemax={1}
                aria-valuenow={draft.score}
                aria-valuetext={draft.score < 0 ? "Oppose" : draft.score > 0 ? "Support" : "Neutral"}
                disabled={busy}
                onChange={(event) => {
                  const score = Number(event.target.value) / 100;
                  setDrafts((current) => ({
                    ...current,
                    [item.id]: { ...current[item.id], score },
                  }));
                }}
                className="townhall-slider mt-3"
              />
              <div
                role="radiogroup"
                aria-label={`Importance of statement ${index + 1}`}
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
                          [item.id]: { ...current[item.id], weight },
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
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="text-sm leading-6 text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-12 items-center justify-center rounded-md bg-amber-500 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-950 transition-colors hover:bg-amber-600 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Filing Townhall…" : "File Townhall"}
      </button>
    </form>
  );
}
