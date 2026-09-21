"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBaselineStanceVector } from "@/app/actions/vector";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import {
  BASELINE_QUESTIONS,
  formatStanceAxis,
  type StanceQuestion,
} from "@/lib/ideology/stance";
import { cn } from "@/lib/utils";
import type { StanceAxis } from "@/types/database.types";

type Answers = Partial<Record<StanceAxis, number>>;

function defaultAnswers(): Answers {
  const next: Answers = {};
  for (const question of BASELINE_QUESTIONS) {
    if (question.kind === "slider") next[question.id] = 0;
  }
  return next;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

export function IdeologyQuiz() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const question = BASELINE_QUESTIONS[step];
  const current = answers[question.id];
  const isLast = step === BASELINE_QUESTIONS.length - 1;
  const canAdvance = current != null && Number.isFinite(current);
  const progress = ((step + 1) / BASELINE_QUESTIONS.length) * 100;

  function setAxis(axis: StanceAxis, score: number) {
    setAnswers((prev) => ({ ...prev, [axis]: score }));
    setError(null);
  }

  async function submit() {
    if (!canAdvance || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureArenaUser();
      const token = await accessToken();
      await saveBaselineStanceVector(answers, token);
      router.push("/my-campaign");
    } catch (caught) {
      if (isNextRedirectError(caught)) {
        router.push("/my-campaign");
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not file your stance vector.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 flex flex-1 flex-col">
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-900">
        <div
          className="h-full bg-gold transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="mt-8 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
        Question {step + 1} of {BASELINE_QUESTIONS.length}
      </p>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
        {question.topic}
      </p>
      <h2 className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
        {question.prompt}
      </h2>

      {question.kind === "slider" ? (
        <SliderPrompt
          question={question}
          value={current ?? 0}
          onChange={(score) => setAxis(question.id, score)}
        />
      ) : (
        <ChoicePrompt
          question={question}
          value={current}
          onChange={(score) => setAxis(question.id, score)}
        />
      )}

      {error ? (
        <p className="mt-6 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </Button>
        {isLast ? (
          <Button
            type="button"
            variant="gold"
            disabled={!canAdvance || busy}
            onClick={() => void submit()}
          >
            {busy ? "Filing stance…" : "File stance vector"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="gold"
            disabled={!canAdvance || busy}
            onClick={() => setStep((value) => Math.min(BASELINE_QUESTIONS.length - 1, value + 1))}
          >
            Next question
          </Button>
        )}
      </div>
    </section>
  );
}

function SliderPrompt({
  question,
  value,
  onChange,
}: {
  question: Extract<StanceQuestion, { kind: "slider" }>;
  value: number;
  onChange: (score: number) => void;
}) {
  return (
    <div className="mt-8 rounded-xl border border-gold/50 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          Coordinate
        </p>
        <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-parchment">
          {formatStanceAxis(value)}
        </p>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        aria-label={question.prompt}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={value}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="mt-6 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-gold"
      />
      <div className="mt-5 grid gap-4 text-sm leading-6 text-zinc-400 sm:grid-cols-2">
        <p>
          <span className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            −1.0
          </span>
          {question.leftLabel}
        </p>
        <p className="sm:text-right">
          <span className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            +1.0
          </span>
          {question.rightLabel}
        </p>
      </div>
    </div>
  );
}

function ChoicePrompt({
  question,
  value,
  onChange,
}: {
  question: Extract<StanceQuestion, { kind: "choice" }>;
  value: number | undefined;
  onChange: (score: number) => void;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {question.options.map((option) => {
        const selected = value === option.score;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.score)}
            className={cn(
              "rounded-xl border px-4 py-4 text-left text-sm leading-6 transition-colors",
              selected
                ? "border-gold bg-gold-strong/15 text-parchment shadow-[inset_3px_0_0_0_var(--gold-strong)]"
                : "border-gold/40 bg-zinc-900 text-zinc-300 hover:border-gold hover:text-parchment",
            )}
          >
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-widest text-gold">
              {formatStanceAxis(option.score)}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
