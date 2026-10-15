import type { Metadata } from "next";
import Link from "next/link";
import { electionsTabs, LaneTabs } from "@/components/lane-tabs";
import { US_STATES } from "@/lib/platform/states";

export const metadata: Metadata = {
  title: "States · WHERE 2 RUN",
  description: "Pick a state to see its federal, state, and local elections.",
};

export default async function ElectionStatesPage(props: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const tier = (await props.searchParams).tier;
  const tierQuery = tier === "federal" || tier === "state" || tier === "local" ? tier : null;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <LaneTabs label="Elections" tabs={electionsTabs("directory")} />
        <header className="mt-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            {tierQuery ? `${tierQuery[0].toUpperCase()}${tierQuery.slice(1)} elections` : "All Elections"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">Fifty states. Open one to filter its seats.</p>
        </header>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {US_STATES.map((state) => (
            <li key={state.code}>
              <Link
                href={tierQuery ? `/elections/${state.code}?tier=${tierQuery}` : `/elections/${state.code}`}
                className="flex items-baseline justify-between rounded-xl border border-amber-500/30 bg-white px-4 py-3 transition-colors hover:border-amber-600"
              >
                <span className="text-sm text-stone-900">{state.name}</span>
                <span className="text-[11px] uppercase tracking-widest text-stone-600">{state.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
