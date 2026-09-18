import type { DebateCandidate, DebateWithCandidates } from "@/types/database.types";

export function unwrapCandidate(
  value: DebateWithCandidates["candidate_a"],
): DebateCandidate | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function candidateById(
  debate: Pick<DebateWithCandidates, "candidate_a" | "candidate_b">,
  candidateId: string | null,
) {
  if (!candidateId) return null;
  const candidateA = unwrapCandidate(debate.candidate_a);
  const candidateB = unwrapCandidate(debate.candidate_b);
  if (candidateA?.id === candidateId) return candidateA;
  if (candidateB?.id === candidateId) return candidateB;
  return null;
}

export function shareFor(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

export function formatWinPercentage(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0%";
  return `${Number.isInteger(numeric) ? numeric : numeric.toFixed(1)}%`;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
