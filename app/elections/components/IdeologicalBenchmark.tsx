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

type RadarPoint = { x: number; y: number };

function polarPoint(index: number, total: number, radius: number, cx: number, cy: number): RadarPoint {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function polygonPath(points: RadarPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ") + " Z";
}

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
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 118;
  const rings = [0.25, 0.5, 0.75, 1];

  const medianPoints = axes.map((axis) =>
    polarPoint(axis.index, axes.length, axis.value * radius, cx, cy),
  );

  return (
    <section aria-labelledby="ideological-benchmark-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          Median voter
        </p>
        <h2
          id="ideological-benchmark-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Ideological benchmark
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          The {officeName} median voter, plotted against the top of the draft
          field across six policy sub-axes.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-center">
        <div className="mx-auto w-full max-w-sm">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Radar chart of the ${officeName} median voter versus top candidates`}
          >
            <circle cx={cx} cy={cy} r={radius + 18} fill="rgb(9 9 11)" />
            {rings.map((ring) => {
              const points = axes.map((axis) =>
                polarPoint(axis.index, axes.length, ring * radius, cx, cy),
              );
              return (
                <path
                  key={ring}
                  d={polygonPath(points)}
                  fill="none"
                  stroke="rgba(212, 180, 90, 0.18)"
                  strokeWidth="1"
                />
              );
            })}
            {axes.map((axis) => {
              const end = polarPoint(axis.index, axes.length, radius, cx, cy);
              const label = polarPoint(axis.index, axes.length, radius + 28, cx, cy);
              return (
                <g key={axis.id}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={end.x}
                    y2={end.y}
                    stroke="rgba(212, 180, 90, 0.28)"
                    strokeWidth="1"
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-zinc-400"
                    fontSize="9"
                    fontFamily="var(--font-geist-sans), system-ui, sans-serif"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}
            <path
              d={polygonPath(medianPoints)}
              fill="color-mix(in oklab, var(--gold) 22%, transparent)"
              stroke="var(--gold)"
              strokeWidth="2"
            />
            {field.map((candidate, seriesIndex) => {
              const points = axes.map((axis) =>
                polarPoint(
                  axis.index,
                  axes.length,
                  candidate.vector[axis.index] * radius,
                  cx,
                  cy,
                ),
              );
              const color = SERIES_COLORS[(seriesIndex + 1) % SERIES_COLORS.length];
              return (
                <path
                  key={candidate.id}
                  d={polygonPath(points)}
                  fill="transparent"
                  stroke={color}
                  strokeWidth="1.75"
                  strokeDasharray={seriesIndex === 1 ? "5 4" : undefined}
                />
              );
            })}
          </svg>
        </div>

        <div>
          <ul className="flex flex-wrap gap-3 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
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
                  <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                    {axis.label}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-zinc-500">
                    Median {Math.round(axis.value * 100)}
                  </p>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-zinc-800">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-gold/80"
                    style={{ width: `${axis.value * 100}%` }}
                  />
                  {field.map((candidate, seriesIndex) => (
                    <span
                      key={candidate.id}
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-950"
                      style={{
                        left: `${candidate.vector[axis.index] * 100}%`,
                        background:
                          SERIES_COLORS[(seriesIndex + 1) % SERIES_COLORS.length],
                      }}
                      title={`${candidate.username}: ${Math.round(candidate.vector[axis.index] * 100)}`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest text-zinc-600">
                  <span>{axis.poles.low}</span>
                  <span>{axis.poles.high}</span>
                </div>
              </li>
            ))}
          </ol>

          {field.length === 0 ? (
            <p className={cn("mt-6 text-sm leading-6 text-zinc-500")}>
              No candidates are on this ticket yet, so only the district median is
              plotted.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
