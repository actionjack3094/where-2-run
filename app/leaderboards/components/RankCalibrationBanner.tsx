"use client";

import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "w2r-rank-banner";
const subscribeNoop = () => () => {};

export function RankCalibrationBanner({ remaining }: { remaining: number }) {
  const notDismissed = useSyncExternalStore(
    subscribeNoop,
    () => window.sessionStorage.getItem(STORAGE_KEY) !== "dismissed",
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);

  if (remaining <= 0 || !notDismissed || dismissed) return null;

  const questions = remaining === 1 ? "question" : "questions";

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-brass bg-brass/10 px-5 py-4 shadow-[inset_3px_0_0_0_var(--brass)]">
      <p className="text-sm leading-6 text-brass">
        Answer {remaining} more {questions} to stabilize your district matches and establish your
        initial rank.
      </p>
      <button
        type="button"
        className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-brass-dark transition-colors hover:text-brass"
        onClick={() => {
          window.sessionStorage.setItem(STORAGE_KEY, "dismissed");
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
