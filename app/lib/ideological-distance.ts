export type IdeologicalPoint = { x: number; y: number };

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Read an ideological_vector JSON object.
 * Accepts `{ x, y }`, `{ ideology_x, ideology_y }`, or a two-number array.
 */
export function parseIdeologicalVector(value: unknown): IdeologicalPoint | null {
  if (Array.isArray(value)) {
    const x = finite(value[0]);
    const y = finite(value[1]);
    if (x == null || y == null) return null;
    return { x, y };
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = finite(record.x ?? record.ideology_x ?? record.economic);
  const y = finite(record.y ?? record.ideology_y ?? record.social);
  if (x == null || y == null) return null;
  return { x, y };
}

/** Euclidean distance on the ideology plane. Smaller is a closer match. */
export function euclideanIdeologicalDistance(user: unknown, candidate: unknown): number | null {
  const left = parseIdeologicalVector(user);
  const right = parseIdeologicalVector(candidate);
  if (!left || !right) return null;
  return Math.sqrt((left.x - right.x) ** 2 + (left.y - right.y) ** 2);
}

/** Cosine similarity in [-1, 1]. 1 is the same direction. */
export function cosineIdeologicalSimilarity(user: unknown, candidate: unknown): number | null {
  const left = parseIdeologicalVector(user);
  const right = parseIdeologicalVector(candidate);
  if (!left || !right) return null;
  const dot = left.x * right.x + left.y * right.y;
  const magnitude = Math.hypot(left.x, left.y) * Math.hypot(right.x, right.y);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}
