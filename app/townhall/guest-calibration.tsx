"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [-1, -0.5, 0, 0.5, 1] as const;
const LABELS = ["Oppose", "Lean no", "Unsure", "Lean yes", "Support"] as const;

const QUESTIONS = [
  {
    id: "zoning",
    title: "Federal Zoning & Housing Density",
    prompt: "Should federal law require cities to allow more homes near transit?",
    economic: -0.72,
    social: -0.2,
  },
  {
    id: "grid",
    title: "Grid & Clean Energy Permitting",
    prompt: "Should clean-energy projects get a faster federal permit?",
    economic: 0.55,
    social: -0.9,
  },
  {
    id: "medicare",
    title: "Medicare & Healthcare Cost Controls",
    prompt: "Should Medicare negotiate prices and cap out-of-pocket costs?",
    economic: -0.84,
    social: 0.42,
  },
] as const;

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function signed(value: number) {
  const text = value.toFixed(2);
  return value > 0 ? `+${text}` : text;
}

export function GuestCalibration() {
  const router = useRouter();
  const [stances, setStances] = useState<(number | null)[]>([null, null, null]);
  let x = 0;
  let y = 0;
  let count = 0;
  stances.forEach((stance, index) => {
    if (stance == null) return;
    x += QUESTIONS[index].economic * stance;
    y += QUESTIONS[index].social * stance;
    count += 1;
  });
  const vector = count === 0 ? null : { x: clamp(x / count), y: clamp(y / count) };

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">Policy Trade-off Calibration</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">Townhall</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Three stances place your ideological vector. No account is required to preview matched primaries.
          </p>
        </header>
        <ol className="mt-8 grid gap-4">
          {QUESTIONS.map((question, index) => (
            <li key={question.id} className="rounded-2xl border border-amber-200/70 bg-white p-5">
              <p className="text-sm font-semibold text-stone-900">{question.title}</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">{question.prompt}</p>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {STEPS.map((step, stepIndex) => {
                  const selected = stances[index] === step;
                  return (
                    <button
                      key={LABELS[stepIndex]}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setStances((current) => current.map((value, item) => (item === index ? step : value)))
                      }
                      className={`rounded-lg border px-1 py-2 text-[11px] font-semibold ${
                        selected
                          ? "border-amber-600 bg-amber-100 text-amber-900"
                          : "border-stone-200 text-stone-600 hover:border-stone-300"
                      }`}
                    >
                      {LABELS[stepIndex]}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
        {vector ? (
          <p className="mt-6 text-sm font-semibold text-stone-900">
            Economic: {signed(vector.x)} · Social: {signed(vector.y)}
          </p>
        ) : null}
        {count === QUESTIONS.length ? (
          <button
            type="button"
            onClick={() => router.push("/?calibrated=true")}
            className="mt-4 inline-flex h-11 w-fit items-center justify-center rounded-md bg-stone-900 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-50"
          >
            Unlock Matched Primaries (Enter at 1,000 AR)
          </button>
        ) : null}
      </div>
    </main>
  );
}
