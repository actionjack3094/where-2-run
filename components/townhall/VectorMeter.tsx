import { confidenceFill, CONFIDENCE_FLOOR } from "@/lib/townhall/calibration";
import { factionTitle } from "@/lib/onboarding/diagnostic";

type Snapshot = {
  x: number;
  y: number;
  confidence: number;
  placed: boolean;
};

function formatAxis(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toFixed(2);
  return rounded > 0 ? `+${text}` : text;
}

export function VectorMeter({ snapshot }: { snapshot: Snapshot }) {
  const percent = Math.round(
    (Number.isFinite(snapshot.confidence) ? snapshot.confidence : CONFIDENCE_FLOOR) * 100,
  );
  const fill = confidenceFill(snapshot.confidence);
  const faction = snapshot.placed ? factionTitle(snapshot) : null;

  return (
    <section aria-label="Your vector" className="mt-8 rounded-3xl border border-amber-500/40 bg-white px-6 py-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Faction</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-stone-900">
        {faction ?? "Vector not filed"}
      </p>
      <p className="mt-3 font-mono text-sm tabular-nums text-stone-700">
        {snapshot.placed
          ? `Economic ${formatAxis(snapshot.x)} · Social ${formatAxis(snapshot.y)}`
          : "Your first answer places you on the plane."}
      </p>
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">
            Ideological Confidence Score
          </p>
          <p className="text-sm font-semibold tabular-nums text-stone-900">{percent}%</p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"
          role="meter"
          aria-label="Ideological Confidence Score"
          aria-valuemin={68}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(68, percent))}
          aria-valuetext={`${percent} percent`}
        >
          <div
            className="h-full rounded-full bg-amber-600 transition-[width] duration-500 ease-out"
            style={{ width: `${fill}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-widest text-stone-500">
          <span>68%</span>
          <span>100%</span>
        </div>
      </div>
    </section>
  );
}
