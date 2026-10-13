import Link from "next/link";
import { IDEOLOGY_VECTOR_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { alignedLane, type RankedRace } from "@/lib/elections/state-directory";
import { partyLabel } from "@/lib/platform/types";
import type { AxisPoint } from "@/lib/platform/scoring";

function seatLabel(race: RankedRace) {
  return race.district ? `${race.state}-${race.district}` : race.state;
}

export function ClosestElections({ races, viewer }: { races: RankedRace[]; viewer: AxisPoint }) {
  if (races.length === 0) return null;

  return (
    <section aria-label="Closest Elections" className="mt-8">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-stone-900">
        Closest Elections
        <InfoTooltip label="Ideology vectors" text={IDEOLOGY_VECTOR_TIP} />
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Ranked by distance from your vector to your party&apos;s primary baseline.
      </p>
      <ul className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
        {races.map((race) => {
          const lane = alignedLane(race, viewer);
          return (
            <li key={race.generalSlug} className="w-64 shrink-0 snap-start">
              <article className="flex h-full flex-col rounded-2xl border border-amber-500/30 bg-white px-4 py-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-widest text-stone-500">{seatLabel(race)}</p>
                <h3
                  className="mt-2 text-base font-semibold text-stone-900"
                  style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
                >
                  {race.officeName}
                </h3>
                <p className="mt-2 text-sm tabular-nums text-stone-600">{race.distance.toFixed(2)} away</p>
                <div className="mt-4 flex flex-col gap-2">
                  {lane ? (
                    <Link
                      href={`/elections/${lane.slug}`}
                      className="inline-flex h-9 items-center justify-center rounded-md bg-gold-strong px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
                    >
                      {partyLabel(lane.party)} primary
                    </Link>
                  ) : null}
                  {race.lanes
                    .filter((item) => item.slug !== lane?.slug)
                    .map((item) => (
                      <Link
                        key={item.slug}
                        href={`/elections/${item.slug}`}
                        className="text-[11px] uppercase tracking-widest text-amber-800"
                      >
                        {partyLabel(item.party)} primary
                      </Link>
                    ))}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
