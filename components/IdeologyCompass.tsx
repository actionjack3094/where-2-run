import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { parseVector } from "@/lib/ideology/vector";

export type CompassPoint = {
  x: number;
  y: number;
  name?: string;
  avatarUrl?: string | null;
};

const COMPASS_MIN = -10;
const COMPASS_MAX = 10;

function clampCompass(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(COMPASS_MAX, Math.max(COMPASS_MIN, value));
}

/** Platform coordinates live on [-1, 1]. The compass draws them on [-10, 10]. */
export function compassFromPlane(x: number, y: number): { x: number; y: number } {
  const scale = (value: number) => clampCompass((Number.isFinite(value) ? value : 0) * 10);
  return { x: scale(x), y: scale(y) };
}

/** Project a stored ideology vector onto the fiscal (x) and social (y) compass. */
export function compassFromIdeologyVector(vector: unknown): { x: number; y: number } {
  const raw = parseVector(vector);
  if (raw.length >= 6) {
    const economy = raw[3] ?? 0;
    const social = raw[4] ?? 0;
    return compassFromPlane(-economy, social);
  }
  return compassFromPlane(raw[0] ?? 0, raw[1] ?? 0);
}

export function IdeologyCompass({
  points,
  className,
}: {
  points: CompassPoint[];
  className?: string;
}) {
  return (
    <figure className={className ?? "w-full max-w-sm"}>
      <figcaption className="text-center text-[11px] uppercase tracking-[0.16em] text-stone-600">
        Progressive / Reform
      </figcaption>
      <div className="relative mt-2 aspect-square rounded-xl border border-amber-500/30 bg-white">
        {[0.25, 0.5, 0.75].map((mark) => (
          <span key={`v-${mark}`}>
            <span
              className="absolute inset-y-3 w-px bg-stone-100"
              style={{ left: `${mark * 100}%` }}
            />
            <span
              className="absolute inset-x-3 h-px bg-stone-100"
              style={{ top: `${mark * 100}%` }}
            />
          </span>
        ))}
        <span className="absolute inset-y-3 left-1/2 w-px bg-stone-300" />
        <span className="absolute inset-x-3 top-1/2 h-px bg-stone-300" />
        <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-stone-600">
          Left / Collective
        </span>
        <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-widest text-stone-600">
          Right / Market
        </span>
        {points.map((point, index) => {
          const x = clampCompass(point.x);
          const y = clampCompass(point.y);
          const left = ((x - COMPASS_MIN) / (COMPASS_MAX - COMPASS_MIN)) * 100;
          const top = ((COMPASS_MAX - y) / (COMPASS_MAX - COMPASS_MIN)) * 100;
          return (
            <span
              key={`${point.name ?? "point"}-${index}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
              title={point.name}
            >
              {point.name ? (
                <CandidateAvatar name={point.name} avatarUrl={point.avatarUrl} size="sm" />
              ) : (
                <span className="block h-3 w-3 rounded-full border border-gold bg-gold" />
              )}
            </span>
          );
        })}
      </div>
      <figcaption className="mt-2 text-center text-[11px] uppercase tracking-[0.16em] text-stone-600">
        Traditional / Order
      </figcaption>
    </figure>
  );
}
