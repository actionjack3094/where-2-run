import type { Metadata } from "next";
import Link from "next/link";
import { ElectionLeaderboard } from "@/components/elections/ElectionLeaderboard";
import { FilingCountdown } from "@/components/elections/FilingCountdown";
import { CIVIC_STANDING_TIP, InfoTooltip, PLEDGED_ESCROW_TIP } from "@/components/InfoTooltip";
import { loadElectionLeaderboard } from "@/lib/elections/leaderboard";
import { loadNextFilingClock } from "@/lib/platform/freeze";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Elections · WHERE 2 RUN",
  description: "Leaderboards, the races on your ballot, and every election on the map.",
};

const actions = [
  {
    href: "/elections?tab=leaderboard",
    title: "Leaderboards",
    body: "Rank the field by Civic Standing and pledged escrow.",
    id: "leaderboard",
  },
  {
    href: "/elections/my-ballot",
    title: "My Ballot Elections",
    body: "Races whose district matches your verified home address.",
    id: "ballot",
  },
  {
    href: "/elections/states",
    title: "All Elections",
    body: "Browse all 50 states, then filter federal, state, and local seats.",
    id: "all",
  },
] as const;

export default async function ElectionsHubPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = (await props.searchParams).tab === "leaderboard" ? "leaderboard" : "browse";
  const [clock, board] = await Promise.all([
    loadNextFilingClock().catch((caught: unknown) => {
      console.error(
        "Could not roll a concluded primary.",
        caught instanceof Error ? caught.message : "Unknown error",
      );
      return null;
    }),
    tab === "leaderboard" ? loadElectionLeaderboard().catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">Discovery</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Elections
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Every seat has its own primary. When a cycle concludes, the next one opens with a filing clock.
          </p>
        </header>

        {clock ? (
          <FilingCountdown cycleYear={clock.cycleYear} deadline={clock.deadline} startedAt={Date.now()} />
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          {actions.map((action) => {
            const active = action.id === "leaderboard" && tab === "leaderboard";
            const shell = cn(
              "flex w-full flex-col rounded-2xl border px-6 py-6 transition-colors",
              active
                ? "border-amber-500 bg-amber-500 text-stone-950"
                : "border-amber-500/30 bg-white text-stone-900 hover:border-amber-500/60",
            );
            const title = (
              <span className={cn("font-display text-2xl font-semibold tracking-tight", active ? "text-stone-950" : "text-stone-900")}>
                {action.title}
              </span>
            );
            if (action.id === "leaderboard") {
              return (
                <article key={action.href} className={shell}>
                  <Link href={action.href} aria-current={active ? "page" : undefined} className="block">
                    {title}
                  </Link>
                  <p className={cn("mt-2 text-sm leading-6", active ? "text-stone-800" : "text-stone-600")}>
                    Rank the field by Civic Standing <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} /> and
                    Pledged Escrow <InfoTooltip label="Pledged Escrow" text={PLEDGED_ESCROW_TIP} />.
                  </p>
                </article>
              );
            }
            return (
              <Link
                key={action.href}
                href={action.href}
                aria-current={active ? "page" : undefined}
                className={shell}
              >
                {title}
                <span className={cn("mt-2 text-sm leading-6", active ? "text-stone-800" : "text-stone-600")}>
                  {action.body}
                </span>
              </Link>
            );
          })}
        </div>

        {tab === "leaderboard" ? <ElectionLeaderboard rows={board} /> : null}
      </div>
    </main>
  );
}
