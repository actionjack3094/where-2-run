"use client";

import { useEffect, useState } from "react";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function parts(deadline: string, now: number) {
  const remaining = Math.max(0, Date.parse(deadline) - now);
  return {
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / SECOND),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function FilingCountdown({
  cycleYear,
  deadline,
  startedAt,
}: {
  cycleYear: number;
  deadline: string;
  startedAt: number;
}) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = parts(deadline, now);
  const filed = new Date(deadline);
  const label = Number.isNaN(filed.getTime())
    ? "Filing deadline"
    : new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      }).format(filed);

  return (
    <section
      aria-label={`${cycleYear} cycle filing deadline`}
      className="mt-8 rounded-2xl border border-amber-500/30 bg-white px-6 py-5"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
        {cycleYear} cycle
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-stone-900">
        Filing deadline
      </h2>
      <p className="mt-1 text-sm text-stone-600">{label}</p>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(
          [
            ["Days", clock.days],
            ["Hours", clock.hours],
            ["Minutes", clock.minutes],
            ["Seconds", clock.seconds],
          ] as const
        ).map(([unit, value]) => (
          <div key={unit} className="rounded-xl border border-amber-500/30 bg-stone-50 px-2 py-3 text-center">
            <p className="font-display text-2xl font-semibold tabular-nums text-stone-900">
              {unit === "Days" ? String(value) : pad(value)}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-stone-500">{unit}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
