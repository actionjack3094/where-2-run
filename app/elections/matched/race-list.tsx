import Link from "next/link";
import { matchedOfficeLabel, type RankedMatch } from "@/lib/elections/matched";
import { alignedLane } from "@/lib/elections/state-directory";
import { partyLabel } from "@/lib/platform/types";

export function MatchedRaceList({
  races,
  viewer,
  questions,
}: {
  races: RankedMatch[];
  viewer: { x: number; y: number } | null;
  questions: Map<string, string>;
}) {
  if (races.length === 0) return null;

  return (
    <ul className="mt-8 grid gap-4">
      {races.map((race) => {
        const lane = alignedLane(race, viewer);
        const href = lane ? `/elections/${lane.slug}` : "/elections";
        const floor = lane ? `/debates/create?primary=${lane.slug}` : "/debates";
        const question = lane ? questions.get(lane.id) : null;
        return (
          <li key={race.generalSlug} className="rounded-2xl border border-amber-500/30 bg-white px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2
                className="text-lg font-semibold text-stone-900"
                style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
              >
                {matchedOfficeLabel(race)}
              </h2>
              <p className="text-sm font-medium tabular-nums text-amber-800">{race.alignment}% Alignment</p>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              {race.incumbentName ? `Challenger vs. ${race.incumbentName}` : "Open Seat"}
              {lane ? ` · ${partyLabel(lane.party)} primary` : ""}
            </p>
            <p className="mt-4 text-sm leading-6 text-stone-800">
              {question ?? "No constituent question is on this race yet."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={floor}
                className="inline-flex h-10 items-center justify-center rounded-md bg-amber-600 px-4 text-[11px] font-semibold uppercase tracking-widest text-white shadow-sm transition hover:bg-amber-700"
              >
                Take the Floor
              </Link>
              <Link
                href={href}
                className="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-800"
              >
                View District Primary
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
