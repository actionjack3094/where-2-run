import { splitBacking } from "@/lib/pledges/backing";
import { formatUsd } from "@/lib/pledges";

export function BackingBar({
  grassroots,
  institutional,
}: {
  grassroots: number;
  institutional: number;
}) {
  const split = splitBacking(grassroots, institutional);
  return (
    <div className="mt-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full bg-amber-400"
          style={{ width: `${split.grassrootsShare * 100}%` }}
        />
        <div
          className="h-full bg-sky-500"
          style={{ width: `${split.institutionalShare * 100}%` }}
        />
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-[11px] uppercase tracking-widest text-stone-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Grassroots {formatUsd(split.grassroots)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          Institutional {formatUsd(split.institutional)}
        </span>
      </p>
    </div>
  );
}
