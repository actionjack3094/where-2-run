"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveStanceVector } from "@/lib/actions/stance-vector";

const QUESTIONS = [
  {
    id: "taxation",
    topic: "Taxation",
    prompt: "Should local government raise taxes to expand public services?",
    oppose: "Keep taxes low and limit new levies.",
    support: "Raise revenue to fund public services.",
  },
  {
    id: "zoning",
    topic: "Zoning / Housing",
    prompt: "Should the city upzone neighborhoods so more housing can be built?",
    oppose: "Preserve existing zoning and neighborhood scale.",
    support: "Upzone to allow more homes.",
  },
  {
    id: "transit",
    topic: "Public Transit",
    prompt: "Should the city expand transit service and give it more street space?",
    oppose: "Prioritize cars and limit transit spending.",
    support: "Expand frequent transit and transit-priority streets.",
  },
  {
    id: "education",
    topic: "Education",
    prompt: "Should the district increase funding and expand public-school programs?",
    oppose: "Hold school budgets flat.",
    support: "Increase public-school funding and program scope.",
  },
  {
    id: "budget",
    topic: "Municipal Budget",
    prompt: "Should the city grow its operating budget faster than inflation?",
    oppose: "Cap spending growth and cut departments.",
    support: "Expand the budget for city services.",
  },
  {
    id: "civic-tech",
    topic: "Civic Fencing / Tech",
    prompt: "Should the city require stronger identity checks and civic technology to gate local participation?",
    oppose: "Keep participation open with minimal identity checks.",
    support: "Require stronger verification and civic-tech fencing.",
  },
] as const;

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function formatAxis(value: number) {
  const rounded = roundTenth(value);
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  return rounded.toFixed(1);
}

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}

export default function StanceQuestionnairePage() {
  const [responses, setResponses] = useState<number[]>(() => QUESTIONS.map(() => 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setResponse(index: number, value: number) {
    setResponses((current) => {
      const next = current.slice();
      next[index] = roundTenth(value);
      return next;
    });
    setError(null);
  }

  async function fileStance() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveStanceVector(responses);
    } catch (caught) {
      if (isNextRedirectError(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "Could not file your stance vector.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Onboarding
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Set your ideological stances
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Six questions, each from strongly oppose (−1) to strongly support (+1).
            Voters and candidates share this six-axis stance vector for ideological matchmaking.
          </p>
        </header>

        <form action={fileStance} className="mt-10 flex flex-col gap-6">
          {QUESTIONS.map((question, index) => {
            const value = responses[index] ?? 0;
            return (
              <fieldset
                key={question.id}
                className="rounded-xl border border-gold/50 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
              >
                <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
                  {question.topic}
                </legend>
                <p className="mt-3 font-display text-xl font-semibold leading-snug tracking-tight text-parchment">
                  {question.prompt}
                </p>
                <div className="mt-6 flex items-baseline justify-between gap-4">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Your stance
                  </p>
                  <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-parchment">
                    {formatAxis(value)}
                  </p>
                </div>
                <input
                  type="range"
                  name={question.id}
                  min={-1}
                  max={1}
                  step={0.1}
                  value={value}
                  aria-label={question.prompt}
                  aria-valuemin={-1}
                  aria-valuemax={1}
                  aria-valuenow={value}
                  aria-valuetext={formatAxis(value)}
                  onChange={(event) => setResponse(index, Number(event.target.value))}
                  className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-gold"
                />
                <div className="mt-5 grid gap-4 text-sm leading-6 text-zinc-400 sm:grid-cols-2">
                  <p>
                    <span className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      Strongly oppose
                    </span>
                    {question.oppose}
                  </p>
                  <p className="sm:text-right">
                    <span className="block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      Strongly support
                    </span>
                    {question.support}
                  </p>
                </div>
              </fieldset>
            );
          })}

          {error ? (
            <p className="text-sm leading-6 text-rose-300" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="gold" size="full" disabled={busy}>
            {busy ? "Filing stance…" : "File stance vector"}
          </Button>
        </form>
      </div>
    </main>
  );
}
