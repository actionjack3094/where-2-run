"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeIdeologyDiagnostic } from "@/app/actions/platform";
import { Button } from "@/components/ui/button";
import { DIAGNOSTIC_QUESTIONS } from "@/lib/platform/questions";
import { formatCoordinate } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

export function DiagnosticQuiz() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(DIAGNOSTIC_QUESTIONS.length).fill(null),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const question = DIAGNOSTIC_QUESTIONS[step];
  const selected = answers[step];
  const isLast = step === DIAGNOSTIC_QUESTIONS.length - 1;
  const progress = ((step + 1) / DIAGNOSTIC_QUESTIONS.length) * 100;

  function choose(score: number) {
    const next = [...answers];
    next[step] = score;
    setAnswers(next);
    setError(null);
    if (!isLast) setStep(step + 1);
  }

  async function finish() {
    if (answers.some((value) => value == null) || busy) {
      setError("Answer every question.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await completeIdeologyDiagnostic(answers as number[]);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.coordinate) {
      router.push(
        `/debates?filed=${encodeURIComponent(formatCoordinate(result.coordinate.x, result.coordinate.y))}`,
      );
    }
  }

  return (
    <section className="mt-10 flex flex-1 flex-col">
      <div className="h-1 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">
        {question.topic} · {step + 1} of {DIAGNOSTIC_QUESTIONS.length}
      </p>
      <h2 className="mt-3 font-display text-2xl font-semibold leading-snug text-stone-900">
        {question.prompt}
      </h2>
      <div className="mt-6 grid gap-3" role="radiogroup" aria-label={question.prompt}>
        {question.options.map((option) => {
          const active = selected === option.score;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(option.score)}
              className={cn(
                "rounded-xl border px-4 py-4 text-left text-sm leading-6 transition-colors",
                active
                  ? "border-gold bg-white text-stone-900"
                  : "border-amber-500/30 bg-white text-stone-600 hover:border-amber-600",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-4 text-sm text-stone-600">{error}</p> : null}
      <div className="mt-8 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0 || busy}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          Back
        </Button>
        {isLast ? (
          <Button type="button" variant="gold" disabled={selected == null || busy} onClick={finish}>
            {busy ? "Filing…" : "File coordinate"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
