import type { Metadata } from "next";
import Link from "next/link";
import { InfoTooltip, CIVIC_STANDING_TIP } from "@/components/InfoTooltip";
import { US_STATES } from "@/lib/platform/states";

export const metadata: Metadata = {
  title: "States · WHERE 2 RUN",
  description: "Pick a state to see its federal, state, and local elections.",
};

export default function ElectionStatesPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/elections" className="text-[11px] uppercase tracking-[0.2em] text-gold">
          Elections
        </Link>
        <header className="mt-4">
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-parchment">
            All Elections
            <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Fifty states. Open one to filter its seats.</p>
        </header>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {US_STATES.map((state) => (
            <li key={state.code}>
              <Link
                href={`/elections/states/${state.code}`}
                className="flex items-baseline justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors hover:border-zinc-600"
              >
                <span className="text-sm text-parchment">{state.name}</span>
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">{state.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
