import { IdeologyCompass, compassFromIdeologyVector } from "@/components/IdeologyCompass";
import { IDEOLOGY_COMPASS_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { cn } from "@/lib/utils";
import {
  sixAxisEntries,
  type SixAxisVector,
} from "@/lib/ideology/six-axis";
import type { ElectionDraftCandidate } from "@/lib/elections";

const SERIES_COLORS = [
  "var(--gold)",
  "oklch(0.72 0.14 200)",
  "oklch(0.7 0.16 330)",
  "oklch(0.68 0.14 140)",
] as const;

export function IdeologicalBenchmark({
  median,
  candidates,
  officeName,
}: {
  median: SixAxisVector;
  candidates: ElectionDraftCandidate[];
  officeName: string;
}) {
  const axes = sixAxisEntries(median);
  const field = candidates.slice(0, 3);
  const compassPoints = [
    { ...compassFromIdeologyVector(median), name: "Median voter" },
    ...field.map((candidate) => ({
      ...compassFromIdeologyVector(candidate.vector),
      name: candidate.username,
    })),
  ];

  return (
    <section aria-labelledby="ideological-benchmark-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-800">
          Median voter
        </p>
        <h2
          id="ideological-benchmark-heading"
          className="mt-3 inline-flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-stone-900"
        >
          Ideology Compass
          <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          The {officeName} median voter and the top of the draft field, plotted on fiscal and social axes.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-center">
        <div className="mx-auto w-full max-w-sm">
          <IdeologyCompass points={compassPoints} />
        </div>

        <div>
          <ul className="flex flex-wrap gap-3 text-[11px] font-medium uppercase tracking-widest text-stone-600">
            <li className="inline-flex items-center gap-2">
              <span className="h-2 w-6 rounded-full bg-gold" />
              District median
            </li>
            {field.map((candidate, seriesIndex) => (
              <li key={candidate.id} className="inline-flex items-center gap-2">
                <span
                  className="h-2 w-6 rounded-full"
                  style={{
                    background: SERIES_COLORS[(seriesIndex + 1) % SERIES_COLORS.length],
                  }}
                />
                {candidate.username}
              </li>
            ))}
          </ul>

          <ol className="mt-6 space-y-4">
            {axes.map((axis) => (
              <li key={axis.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">
                    {axis.label}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-stone-600">
                    Median {Math.round(axis.value * 100)}
                  </p>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-stone-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-gold/80"
                    style={{ width: `${axis.value * 100}%` }}
                  />
                  {field.map((candidate, seriesIndex) => (
                    <span
                      key={candidate.id}
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-900"
                      style={{
                        left: `${candidate.vector[axis.index] * 100}%`,
                        background:
                          SERIES_COLORS[(seriesIndex + 1) % SERIES_COLORS.length],
                      }}
                      title={`${candidate.username}: ${Math.round(candidate.vector[axis.index] * 100)}`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest text-stone-600">
                  <span>{axis.poles.low}</span>
                  <span>{axis.poles.high}</span>
                </div>
              </li>
            ))}
          </ol>

          {field.length === 0 ? (
            <p className={cn("mt-6 text-sm leading-6 text-stone-600")}>
              No candidates are on this ticket yet, so only the district median is
              plotted.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
