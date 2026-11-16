import Link from "next/link";
import { ClosestElections } from "@/app/elections/[state]/closest-elections";
import { StatewideIssues } from "@/app/elections/[state]/statewide-issues";
import { TierDirectory } from "@/app/elections/[state]/tier-directory";
import type { DirectoryRace, RankedRace, RaceTier } from "@/lib/elections/state-directory";
import { cn } from "@/lib/utils";

type Viewer = { signedIn: boolean; verified: boolean; point: { x: number; y: number } | null };

export function StateElectionsView({
  code,
  name,
  viewer,
  ranked,
  selectedTier,
  agendaTab,
  counts,
  tierRaces,
  setup,
  hasPrimaries,
  statewide,
  targets,
  agendaMissing,
}: {
  code: string;
  name: string;
  viewer: Viewer;
  ranked: RankedRace[];
  selectedTier: RaceTier | null;
  agendaTab: boolean;
  counts: Record<RaceTier, number>;
  tierRaces: DirectoryRace[];
  setup: string | null;
  hasPrimaries: boolean;
  statewide: { id: string; title: string; content: string; upvoteCount: number; officeName: string; partyLabel: string; primaryHref: string }[];
  targets: { id: string; label: string }[];
  agendaMissing: boolean;
}) {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/elections/states" className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
          All states
        </Link>
        <header className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{name}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Active general elections in {code}, grouped by federal, state, and local seats.
          </p>
        </header>
        {viewer.signedIn && !viewer.point ? (
          <p className="mt-8 text-sm leading-6 text-stone-600">
            <Link href="/onboarding" className="text-amber-800">Finish onboarding</Link> to rank the closest elections in {name}.
          </p>
        ) : null}
        {viewer.point ? <ClosestElections races={ranked} viewer={viewer.point} /> : null}
        <div role="tablist" aria-label="State elections" className="mt-8 flex flex-wrap gap-2">
          <Link
            href={selectedTier ? `/elections/${code}?tier=${selectedTier}` : `/elections/${code}`}
            role="tab"
            aria-selected={!agendaTab}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              !agendaTab ? "bg-gold-strong text-stone-900" : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            Elections
          </Link>
          <Link
            href={`/elections/${code}?tab=agenda`}
            role="tab"
            aria-selected={agendaTab}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              agendaTab ? "bg-gold-strong text-stone-900" : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            Statewide Issues
          </Link>
        </div>
        {setup ? <p className="mt-8 text-sm text-stone-600">{setup}</p> : null}
        {!setup && !agendaTab && !hasPrimaries ? (
          <p className="mt-8 text-sm text-stone-600">No primaries filed in {name} yet.</p>
        ) : null}
        {!setup && !agendaTab && hasPrimaries ? (
          <TierDirectory stateCode={code} counts={counts} selected={selectedTier} races={tierRaces} />
        ) : null}
        {!setup && agendaTab ? (
          <StatewideIssues issues={statewide} targets={targets} signedIn={viewer.signedIn} verified={viewer.verified} missing={agendaMissing} />
        ) : null}
      </div>
    </main>
  );
}
