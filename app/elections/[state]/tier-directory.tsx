import Link from "next/link";
import type { DirectoryRace, RaceTier } from "@/lib/elections/state-directory";
import { partyLabel } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const TIERS: { id: RaceTier; label: string }[] = [
  { id: "federal", label: "Federal" },
  { id: "state", label: "State" },
  { id: "local", label: "Local" },
];

function raceCount(count: number) {
  return `${count} ${count === 1 ? "Race" : "Races"}`;
}

function seatLabel(race: DirectoryRace) {
  return race.district ? `${race.state}-${race.district}` : race.state;
}

export function TierDirectory({
  stateCode,
  counts,
  selected,
  races,
}: {
  stateCode: string;
  counts: Record<RaceTier, number>;
  selected: RaceTier | null;
  races: DirectoryRace[];
}) {
  const base = `/elections/${stateCode}`;

  return (
    <section className="mt-10" aria-label="Election tiers">
      <div className="grid gap-4 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const open = selected === tier.id;
          return (
            <Link
              key={tier.id}
              href={open ? base : `${base}?tier=${tier.id}`}
              aria-expanded={open}
              className={cn(
                "flex min-h-36 flex-col justify-between rounded-2xl border px-5 py-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                open
                  ? "border-amber-600 bg-amber-500 text-stone-950"
                  : "border-amber-500/40 bg-white text-stone-900 hover:border-amber-600",
              )}
            >
              <span className="font-display text-2xl font-semibold tracking-tight">{tier.label}</span>
              <span
                className={cn(
                  "mt-6 inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest",
                  open ? "bg-stone-950/10 text-stone-950" : "bg-stone-100 text-stone-700",
                )}
              >
                {raceCount(counts[tier.id])}
              </span>
            </Link>
          );
        })}
      </div>

      {selected ? (
        <div className="mt-6">
          <h2 className="font-display text-xl text-stone-900">
            {TIERS.find((tier) => tier.id === selected)?.label} races
          </h2>
          {races.length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">No active {selected} races in this state yet.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {races.map((race) => (
                <li key={race.generalSlug} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
                  <p className="text-sm font-medium text-stone-900">
                    {race.officeName}
                    {" · "}
                    {seatLabel(race)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4">
                    {race.lanes.map((lane) => (
                      <Link
                        key={lane.slug}
                        href={`/elections/${lane.slug}`}
                        className="text-[11px] uppercase tracking-widest text-amber-800"
                      >
                        {partyLabel(lane.party)} primary
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
