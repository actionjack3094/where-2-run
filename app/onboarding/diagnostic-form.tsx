"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileDiagnostic } from "@/lib/actions/onboarding-diagnostic";
import {
  DIAGNOSTIC_LENGTH,
  nextDiagnosticQuestion,
  type DiagnosticAnswer,
} from "@/lib/onboarding/diagnostic";

export function DiagnosticForm() {
  const router = useRouter();
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = nextDiagnosticQuestion(answers);
  if (!question) {
    return <p className="mt-10 text-sm text-stone-600">{error ?? "Saving your vector…"}</p>;
  }
  const current = question;

  const step = answers.length + 1;
  const axis = current.axis === "x" ? "Economic" : "Governance";

  async function choose(choiceId: string, score: number) {
    if (busy) return;
    const next = [
      ...answers,
      { id: current.id, axis: current.axis, choiceId, score },
    ];
    setError(null);
    if (next.length < DIAGNOSTIC_LENGTH) {
      setAnswers(next);
      return;
    }

    setBusy(true);
    const result = await fileDiagnostic(next);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push("/onboarding/results");
    router.refresh();
  }

  return (
    <section className="mt-10" aria-labelledby="diagnostic-heading">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">
        Question {step} of {DIAGNOSTIC_LENGTH} · {axis}
      </p>
      <h2 id="diagnostic-heading" className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900">
        {current.prompt}
      </h2>
      <div className="mt-6 grid gap-3">
        {current.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={busy}
            onClick={() => choose(choice.id, choice.score)}
            className="rounded-2xl border border-amber-500/30 bg-white px-5 py-4 text-left text-sm leading-6 text-stone-800 transition-colors hover:border-amber-600 disabled:opacity-60"
          >
            {choice.label}
          </button>
        ))}
      </div>
      {answers.length > 0 ? (
        <button
          type="button"
          className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-stone-500 hover:text-stone-900"
          onClick={() => setAnswers((current) => current.slice(0, -1))}
        >
          Back
        </button>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
