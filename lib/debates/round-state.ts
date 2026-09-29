/**
 * Round state for a debate, derived from the `arguments` table.
 *
 * `arguments` holds one row per (debate, author, round) and is the source of
 * truth. `debates.candidate_a_argument` / `candidate_b_argument` only mirror
 * the latest text each candidate filed, so they are never used to decide whose
 * turn it is (they used to be cleared between rounds, which is what wiped the
 * cards on /debates/[debateId]).
 */

export type ArgumentRow = {
  author_id: string;
  round_number: number;
  content: string;
};

export type RoundDebate = {
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  current_round: number;
  candidate_a_argument?: string | null;
  candidate_b_argument?: string | null;
};

export type Turn = "a" | "b" | "complete";

export type RoundPair = {
  round: number;
  a: string | null;
  b: string | null;
};

function clean(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * Text a candidate filed in a round. When a candidate has no `arguments` rows
 * at all (older debates that only used the mirror columns) round 1 falls back
 * to their mirror column.
 */
export function argumentFor(
  rows: ArgumentRow[],
  debate: RoundDebate,
  side: "a" | "b",
  round: number,
): string | null {
  const authorId = side === "a" ? debate.candidate_a_id : debate.candidate_b_id;
  if (authorId) {
    const filed = rows
      .filter((row) => row.author_id === authorId && row.round_number === round)
      .at(-1);
    const text = clean(filed?.content);
    if (text) return text;
  }

  const hasAnyRow = Boolean(authorId && rows.some((row) => row.author_id === authorId));
  if (!hasAnyRow && round === 1) {
    return clean(side === "a" ? debate.candidate_a_argument : debate.candidate_b_argument);
  }
  return null;
}

export function turnFor(rows: ArgumentRow[], debate: RoundDebate): Turn {
  const round = debate.current_round;
  if (!argumentFor(rows, debate, "a", round)) return "a";
  if (!argumentFor(rows, debate, "b", round)) return "b";
  return "complete";
}

/** One entry per round that has started, oldest first. Always includes round 1. */
export function roundPairs(rows: ArgumentRow[], debate: RoundDebate): RoundPair[] {
  const filedRounds = rows.map((row) => row.round_number);
  const last = Math.max(1, debate.current_round, ...filedRounds);
  const pairs: RoundPair[] = [];
  for (let round = 1; round <= last; round += 1) {
    pairs.push({
      round,
      a: argumentFor(rows, debate, "a", round),
      b: argumentFor(rows, debate, "b", round),
    });
  }
  return pairs;
}

/** Sim bots are seeded with `sim-<slug>` usernames (see scripts/arena-sim.ts). */
export function isSimUsername(username: string | null | undefined) {
  return Boolean(username?.trim().toLowerCase().startsWith("sim-"));
}
