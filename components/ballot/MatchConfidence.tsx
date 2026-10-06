import { matchConfidenceLabel } from "@/lib/ballot/fading";

export function MatchConfidence({ percent, stale }: { percent: number | null; stale: boolean }) {
  const label =
    percent == null ? (stale ? "Stance Stale" : "Stance current") : matchConfidenceLabel(percent, stale);
  return (
    <div className="mt-3">
      <p className="text-[11px] uppercase tracking-widest text-zinc-400">{label}</p>
      <div
        className={
          stale
            ? "stance-stale mt-2 h-2 rounded-full"
            : "mt-2 h-2 rounded-full bg-amber-400/80"
        }
        role="img"
        aria-label={label}
      />
      {stale ? (
        <p className="mt-2 text-xs leading-5 text-zinc-400">
          This stance has gone quiet. The candidate has to update it on the Agenda Queue.
        </p>
      ) : null}
    </div>
  );
}
