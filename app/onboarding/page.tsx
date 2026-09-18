"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/db/supabase";
import { pickFunnelMatches, type DistrictMatch, type FunnelMatches } from "@/lib/ideology/match";
import { buildUserVector, QUIZ_QUESTIONS } from "@/lib/ideology/questions";
import { normalizeVector } from "@/lib/ideology/vector";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";

type QuizStage = "quiz" | "loading" | "results" | "error";

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => Array(QUIZ_QUESTIONS.length).fill(null),
  );
  const [stage, setStage] = useState<QuizStage>("quiz");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<FunnelMatches | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);

  const question = QUIZ_QUESTIONS[step];
  const currentAnswer = answers[step];
  const progress =
    stage === "quiz"
      ? ((step + 1) / QUIZ_QUESTIONS.length) * 100
      : 100;

  async function scoreQuiz(nextAnswers: (number | null)[]) {
    const scores = nextAnswers.map((value) => value ?? 0.5);
    const userVector = normalizeVector(buildUserVector(scores));

    setStage("loading");
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("districts")
      .select("*");

    if (fetchError || !data) {
      setError(fetchError?.message ?? "Could not load districts.");
      setStage("error");
      return;
    }

    const funnel = pickFunnelMatches(userVector, data);
    if (!funnel) {
      setError("No seeded districts were found.");
      setStage("error");
      return;
    }

    setMatches(funnel);
    setSelectedDistrictId(funnel.safePrimary.district.id);
    window.sessionStorage.setItem(STORAGE_KEYS.vector, JSON.stringify(userVector));
    window.sessionStorage.setItem(
      STORAGE_KEYS.districtId,
      funnel.safePrimary.district.id,
    );
    setStage("results");
  }

  function handleSelectOption(score: number) {
    const nextAnswers = [...answers];
    nextAnswers[step] = score;
    setAnswers(nextAnswers);

    if (step < QUIZ_QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }

    void scoreQuiz(nextAnswers);
  }

  function handleConfirm() {
    if (selectedDistrictId) {
      window.sessionStorage.setItem(STORAGE_KEYS.districtId, selectedDistrictId);
    }
  }

  function resetQuiz() {
    setStep(0);
    setAnswers(Array(QUIZ_QUESTIONS.length).fill(null));
    setMatches(null);
    setSelectedDistrictId(null);
    setError(null);
    setStage("quiz");
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-1 flex-col px-6 py-10">
      <Link
        href="/"
        className="w-fit text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
      >
        Where 2 Run
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {stage === "results" ? "Your districts" : "Ideological funnel"}
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {stage === "results"
          ? "A safe primary and a toss-up general, scored against each district median."
          : "Six policy questions. Four options each. We map your answers onto a 10-dimensional vector."}
      </p>

      {stage !== "results" && (
        <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
          <div
            className="h-full bg-zinc-950 transition-all duration-300 dark:bg-zinc-50"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {stage === "quiz" && question && (
        <section className="mt-10 flex flex-1 flex-col">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Question {step + 1} of {QUIZ_QUESTIONS.length}
          </p>
          <h2 className="mt-3 text-xl font-medium leading-snug tracking-tight">
            {question.prompt}
          </h2>
          <div className="mt-8 flex flex-col gap-3">
            {question.options.map((option) => {
              const selected = currentAnswer === option.score;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelectOption(option.score)}
                  className={cn(
                    "rounded-xl border px-4 py-4 text-left text-sm leading-6 transition-colors",
                    selected
                      ? "border-zinc-950 bg-zinc-950 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                      : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-500",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="mt-8">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
          </div>
        </section>
      )}

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Matching your vector to seeded districts…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Something went wrong."}
          </p>
          <Button type="button" onClick={resetQuiz}>
            Try again
          </Button>
        </section>
      )}

      {stage === "results" && matches && (
        <section className="mt-10 flex flex-1 flex-col gap-4">
          <MatchCard
            eyebrow="Safe Primary Match"
            match={matches.safePrimary}
            selected={selectedDistrictId === matches.safePrimary.district.id}
            onSelect={() => setSelectedDistrictId(matches.safePrimary.district.id)}
          />
          <MatchCard
            eyebrow="Toss-Up General Match"
            match={matches.tossUpGeneral}
            selected={selectedDistrictId === matches.tossUpGeneral.district.id}
            onSelect={() => setSelectedDistrictId(matches.tossUpGeneral.district.id)}
          />
          <Button asChild size="lg" className="mt-4 w-full">
            <Link href="/arena" onClick={handleConfirm}>
              Confirm District & Enter Arena
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={resetQuiz}>
            Retake quiz
          </Button>
        </section>
      )}
    </main>
  );
}

function MatchCard({
  eyebrow,
  match,
  selected,
  onSelect,
}: {
  eyebrow: string;
  match: DistrictMatch;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="w-full text-left">
      <Card
        className={cn(
          "transition-colors",
          selected
            ? "border-zinc-950 ring-1 ring-zinc-950 dark:border-zinc-50 dark:ring-zinc-50"
            : "hover:border-zinc-400",
        )}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            {eyebrow}
          </p>
          <CardTitle className="text-lg">{match.district.name}</CardTitle>
          <CardDescription>{match.district.historical_lean ?? "Lean unpublished"}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end justify-between">
          <p className="text-xs uppercase tracking-widest text-zinc-400">
            {match.district.level}
          </p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {match.matchPercent}%
          </p>
        </CardContent>
      </Card>
    </button>
  );
}
