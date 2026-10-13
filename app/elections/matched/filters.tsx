import Link from "next/link";
import type { GeoScope, OfficeFilter, ViabilityFilter } from "@/lib/elections/matched";
import { cn } from "@/lib/utils";

const SCOPES: { id: GeoScope; label: string }[] = [
  { id: "backyard", label: "My Backyard" },
  { id: "state", label: "In-State Only" },
  { id: "nationwide", label: "Nationwide" },
];

const LEVELS: { id: OfficeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "federal", label: "Federal" },
  { id: "state", label: "State" },
  { id: "local", label: "Local" },
];

const SEATS: { id: ViabilityFilter; label: string }[] = [
  { id: "all", label: "All Seats" },
  { id: "open", label: "Open Seats Only" },
];

function href(scope: GeoScope, level: OfficeFilter, seats: ViabilityFilter) {
  const params = new URLSearchParams();
  if (scope !== "backyard") params.set("scope", scope);
  if (level !== "all") params.set("level", level);
  if (seats !== "all") params.set("seats", seats);
  const query = params.toString();
  return query ? `/elections/matched?${query}` : "/elections/matched";
}

function Bar<T extends string>({
  label,
  options,
  selected,
  hrefFor,
}: {
  label: string;
  options: { id: T; label: string }[];
  selected: T;
  hrefFor: (id: T) => string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const pressed = option.id === selected;
          return (
            <Link
              key={option.id}
              href={hrefFor(option.id)}
              role="radio"
              aria-checked={pressed}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full px-4 text-[11px] font-semibold uppercase tracking-widest",
                pressed
                  ? "bg-gold-strong text-stone-900"
                  : "border border-stone-300 bg-white text-stone-700 hover:border-amber-600",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function MatchedFilters({
  scope,
  level,
  seats,
}: {
  scope: GeoScope;
  level: OfficeFilter;
  seats: ViabilityFilter;
}) {
  return (
    <div className="mt-8 grid gap-5">
      <Bar
        label="Geographic scope"
        options={SCOPES}
        selected={scope}
        hrefFor={(id) => href(id, level, seats)}
      />
      <Bar
        label="Level of office"
        options={LEVELS}
        selected={level}
        hrefFor={(id) => href(scope, id, seats)}
      />
      <Bar
        label="Viability"
        options={SEATS}
        selected={seats}
        hrefFor={(id) => href(scope, level, id)}
      />
    </div>
  );
}
