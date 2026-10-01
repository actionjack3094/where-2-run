"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveBaselineCalibration } from "@/lib/actions/onboarding-funnel";
import { QUIZ_QUESTIONS } from "@/lib/ideology/questions";
import { SIX_AXIS_IDS, SIX_AXIS_LABELS, type SixAxisId } from "@/lib/ideology/six-axis";
import { cn } from "@/lib/utils";

const CALIBRATION_QUESTIONS = QUIZ_QUESTIONS.slice(0, 3);
const CALIBRATION_AXES = SIX_AXIS_IDS.slice(0, 3) as SixAxisId[];

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

export function CalibrationStep({ onBack }: { onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<SixAxisId, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = CALIBRATION_QUESTIONS[index];
  const axisId = CALIBRATION_AXES[index] ?? SIX_AXIS_IDS[index];
  const selected = answers[axisId];
  const isLast = index === CALIBRATION_QUESTIONS.length - 1;

  async function choose(score: number) {
    if (busy || !axisId) return;
    const next = { ...answers, [axisId]: score };
    setAnswers(next);
    setError(null);

    if (!isLast) {
      setIndex((current) => Math.min(CALIBRATION_QUESTIONS.length - 1, current + 1));
      return;
    }

    setBusy(true);
    try {
      await saveBaselineCalibration(next);
    } catch (caught) {
      if (isNextRedirectError(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "Could not seed your stance vector.");
      setBusy(false);
    }
  }

  if (!question) return null;

  return (
    <section className="mt-10" aria-labelledby="calibration-heading">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          Step 02 · Calibration
        </p>
        <h2
          id="calibration-heading"
          className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Baseline vector
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Three rapid-fire policy questions seed your stance vector so the matchmaker
          can rank rivals immediately.
        </p>
      </header>

      <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-zinc-900">
        <div
          className="h-full bg-gold transition-all duration-300"
          style={{ width: `${((index + 1) / CALIBRATION_QUESTIONS.length) * 100}%` }}
        />
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
        Question {index + 1} of {CALIBRATION_QUESTIONS.length}
      </p>

      <article className="mt-4 rounded-xl border border-gold/50 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
        <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
          {SIX_AXIS_LABELS[axisId]}
        </p>
        <h3 className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
          {question.prompt}
        </h3>
        <ul className="mt-6 flex flex-col gap-2">
          {question.options.map((option) => {
            const active = selected === option.score;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void choose(option.score)}
                  className={cn(
                    "w-full rounded-lg border px-4 py-3 text-left text-sm leading-6 transition-colors disabled:pointer-events-none disabled:opacity-50",
                    active
                      ? "border-gold bg-gold/10 text-parchment"
                      : "border-gold/30 bg-zinc-950 text-zinc-200 hover:border-gold hover:text-parchment",
                  )}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      </article>

      {error ? (
        <p className="mt-4 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
    </section>
  );
}
