"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "w2r-calibration-banner";

export function CalibrationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.sessionStorage.getItem(STORAGE_KEY) !== "dismissed");
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-8 flex items-start justify-between gap-4 rounded-xl border border-brass bg-brass/10 px-5 py-4 shadow-[inset_3px_0_0_0_var(--brass)]">
      <p className="text-sm leading-6 text-brass">
        Answer 5 more questions to stabilize your district matches and establish your initial rank.
      </p>
      <button
        type="button"
        className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-brass-dark transition-colors hover:text-brass"
        onClick={() => {
          window.sessionStorage.setItem(STORAGE_KEY, "dismissed");
          setVisible(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
