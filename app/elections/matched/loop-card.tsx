"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "where2run:matched-loop";

const STEPS = [
  { label: "Speak", detail: "Soapbox" },
  { label: "Baseline", detail: "Townhall" },
  { label: "Clash", detail: "Debates" },
  { label: "Vote / Run", detail: "Ballot" },
] as const;

export function MatchedLoopCard() {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    setVisible(window.localStorage.getItem(STORAGE_KEY) !== "dismissed");
  }, []);

  if (visible !== true) return null;

  return (
    <aside className="rounded-2xl border border-amber-500/40 bg-white px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">How the floor works</p>
          <h2 className="mt-2 font-display text-xl text-stone-900">Your matched elections</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(STORAGE_KEY, "dismissed");
            setVisible(false);
          }}
          className="text-[11px] font-semibold uppercase tracking-widest text-stone-500 hover:text-stone-900"
        >
          Dismiss
        </button>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.detail} className="rounded-xl bg-stone-50 px-3 py-3">
            <p className="text-[11px] uppercase tracking-widest text-stone-500">{index + 1}</p>
            <p className="mt-1 text-sm font-medium text-stone-900">{step.label}</p>
            <p className="text-sm text-stone-600">{step.detail}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
