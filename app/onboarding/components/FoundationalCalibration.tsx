"use client";

import { useState } from "react";
import { establishBaselineIdeologyVector } from "@/app/actions/vector";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { QUIZ_QUESTIONS } from "@/lib/ideology/questions";
import { SIX_AXIS_IDS, SIX_AXIS_LABELS, type SixAxisId } from "@/lib/ideology/six-axis";
import { cn } from "@/lib/utils";

type Answers = Partial<Record<SixAxisId, number>>;

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function isSixAxisId(value: string): value is SixAxisId {
  return (SIX_AXIS_IDS as readonly string[]).includes(value);
}

export function FoundationalCalibration({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = QUIZ_QUESTIONS[index];
  const axisId = question && isSixAxisId(question.id) ? question.id : SIX_AXIS_IDS[index];
  const selected = answers[axisId];
  const isLast = index === QUIZ_QUESTIONS.length - 1;

  async function choose(score: number) {
    if (busy || !axisId) return;
    const next = { ...answers, [axisId]: score };
    setAnswers(next);
    setError(null);

    if (!isLast) {
      setIndex((current) => Math.min(QUIZ_QUESTIONS.length - 1, current + 1));
      return;
    }

    setBusy(true);
    try {
      await ensureArenaUser();
      const token = await accessToken();
      await establishBaselineIdeologyVector(next, token);
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calibrate your vector.");
      setBusy(false);
    }
  }

  if (!question) return null;

  return (
    <section className="mt-10" aria-labelledby="calibration-heading">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          Step 02
        </p>
        <h2
          id="calibration-heading"
          className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Foundational calibration
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Six axes, one plank at a time. The last answer files your baseline ideology
          vector.
        </p>
      </header>

      <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-zinc-900">
        <div
          className="h-full bg-gold transition-all duration-300"
          style={{ width: `${((index + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
        />
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
        Question {index + 1} of {QUIZ_QUESTIONS.length}
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

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setError(null);
            if (index === 0) onBack();
            else setIndex((current) => Math.max(0, current - 1));
          }}
        >
          Back
        </Button>
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          {busy ? "Calibrating vector…" : isLast ? "Last axis files the vector" : "Pick a plank"}
        </p>
      </div>
    </section>
  );
}
