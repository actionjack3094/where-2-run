import type { Metadata } from "next";
import Link from "next/link";
import { ElectionLeaderboard } from "@/components/elections/ElectionLeaderboard";
import {
  CIVIC_STANDING_TIP,
  DISTRICT_AGENDA_TIP,
  IDEOLOGY_COMPASS_TIP,
  InfoTooltip,
  TOWN_HALL_TIP,
} from "@/components/InfoTooltip";
import { loadElectionLeaderboard } from "@/lib/elections/leaderboard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Elections · WHERE 2 RUN",
  description: "Find a race by state, or open the elections on your ballot.",
};

const definitions = [
  { label: "Civic Standing", text: CIVIC_STANDING_TIP },
  { label: "Ideology Compass", text: IDEOLOGY_COMPASS_TIP },
  { label: "District Agenda", text: DISTRICT_AGENDA_TIP },
  { label: "Town Hall Q&A", text: TOWN_HALL_TIP },
] as const;

export default async function ElectionsHubPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = (await props.searchParams).tab === "leaderboard" ? "leaderboard" : "browse";
  const board = tab === "leaderboard" ? await loadElectionLeaderboard().catch(() => []) : [];

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Discovery</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Elections
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Every seat has its own primary. Start with the whole map, or the races on your verified address.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
            {definitions.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                {item.label}
                <InfoTooltip label={item.label} text={item.text} />
              </li>
            ))}
          </ul>
        </header>

        <div role="tablist" aria-label="Elections" className="mt-8 flex flex-wrap gap-2">
          <Link
            href="/elections"
            role="tab"
            aria-selected={tab === "browse"}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              tab === "browse"
                ? "bg-gold-strong text-zinc-950"
                : "border border-gold/40 text-zinc-400 hover:border-gold hover:text-parchment",
            )}
          >
            Browse
          </Link>
          <Link
            href="/elections?tab=leaderboard"
            role="tab"
            aria-selected={tab === "leaderboard"}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              tab === "leaderboard"
                ? "bg-gold-strong text-zinc-950"
                : "border border-gold/40 text-zinc-400 hover:border-gold hover:text-parchment",
            )}
          >
            Leaderboard
          </Link>
        </div>

        {tab === "leaderboard" ? (
          <ElectionLeaderboard rows={board} />
        ) : (
          <div className="mt-10 grid gap-4">
            <Link
              href="/elections/states"
              className="rounded-2xl border border-gold bg-zinc-900 px-6 py-10 transition-colors hover:bg-zinc-800"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Nationwide</p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-parchment">
                All Elections
              </p>
              <p className="mt-2 text-sm text-zinc-400">Browse all 50 states, then filter federal, state, and local seats.</p>
            </Link>
            <Link
              href="/elections/my-ballot"
              className="rounded-2xl border border-zinc-700 bg-zinc-900 px-6 py-10 transition-colors hover:border-zinc-500"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Your address</p>
              <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-parchment">
                My Ballot Elections
              </p>
              <p className="mt-2 text-sm text-zinc-400">Races whose district matches your verified home address.</p>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
