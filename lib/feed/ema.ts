import { buildUserVector } from "@/lib/ideology/questions";
import {
  emptySixAxis,
  SIX_AXIS_DIMENSIONS,
  toSixAxisVector,
  type SixAxisVector,
} from "@/lib/ideology/six-axis";
import { clamp01 } from "@/lib/ideology/vector";
import { IDEOLOGY_EMA_ALPHA } from "@/lib/feed/types";

export function applyIdeologyEma(
  current: unknown,
  stance: SixAxisVector,
  alpha = IDEOLOGY_EMA_ALPHA,
): { six: SixAxisVector; ten: number[] } {
  const weight = Number.isFinite(alpha) ? Math.min(1, Math.max(0.01, alpha)) : IDEOLOGY_EMA_ALPHA;
  const previous = toSixAxisVector(current);
  const next = emptySixAxis();

  for (let index = 0; index < SIX_AXIS_DIMENSIONS; index += 1) {
    next[index] = clamp01(weight * (stance[index] ?? 0.5) + (1 - weight) * (previous[index] ?? 0.5));
  }

  return { six: next, ten: buildUserVector([...next]) };
}

export function calibrationVector(axisIndex: number, score: number): SixAxisVector {
  const next = emptySixAxis();
  if (axisIndex >= 0 && axisIndex < SIX_AXIS_DIMENSIONS) {
    next[axisIndex] = clamp01(score);
  }
  return next;
}
