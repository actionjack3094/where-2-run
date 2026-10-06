export const ROUND_CHAR_LIMIT = 500;

export const DEBATE_ROUNDS = [
  { number: 1, label: "Opening Statement", speaker: "a" },
  { number: 2, label: "Rebuttal 1", speaker: "b" },
  { number: 3, label: "Rebuttal 2", speaker: "a" },
  { number: 4, label: "Closing Statement", speaker: "b" },
] as const;

export const TOTAL_ROUNDS = DEBATE_ROUNDS.length;

export type DebateRound = (typeof DEBATE_ROUNDS)[number];

export function roundByNumber(round: number): DebateRound | null {
  return DEBATE_ROUNDS.find((entry) => entry.number === round) ?? null;
}

export function roundLabel(round: number) {
  return roundByNumber(round)?.label ?? `Round ${round}`;
}

export function cleanRoundText(
  raw: string,
  label: string,
): { text: string } | { error: string } {
  const text = raw.trim();
  if (text.length < 20) return { error: `${label} needs at least a short paragraph.` };
  if (text.length > ROUND_CHAR_LIMIT) {
    return { error: `${label} is ${ROUND_CHAR_LIMIT} characters at most.` };
  }
  return { text };
}

export type RoundEntry = {
  round: number;
  author_id: string;
  content: string;
};

export function appendRound(existing: unknown, entry: RoundEntry): RoundEntry[] {
  const prior = Array.isArray(existing)
    ? existing.filter(
        (row): row is RoundEntry =>
          Boolean(row) &&
          typeof row === "object" &&
          typeof (row as RoundEntry).round === "number" &&
          typeof (row as RoundEntry).content === "string" &&
          typeof (row as RoundEntry).author_id === "string",
      )
    : [];
  return [...prior.filter((row) => row.round !== entry.round), entry];
}
