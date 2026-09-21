export const ADDENDUM_WORD_LIMIT = 150;
export const MARGINAL_CONFIDENCE_MIN = 0.6;
export const MARGINAL_CONFIDENCE_MAX = 0.89;

export const RUBRIC_FLAGS = [
  "on_topic_fidelity",
  "local_mechanism",
  "positional_consistency",
  "evidence_over_slogans",
  "anti_troll",
] as const;

export type RubricFlag = (typeof RUBRIC_FLAGS)[number];

export const PUBLIC_RUBRIC = `WHERE 2 RUN Public Debate Rubric

Score the candidate's filed arguments from 0 to 100 against these criteria. Name the single weakest criterion as rubric_flag.

1. on_topic_fidelity — Stays on the stated floor question. No pivot, slogan dump, or thread hijack.
2. local_mechanism — Names a district-specific tool: ordinance, budget line, tax, school, precinct, or constituent cost.
3. positional_consistency — The claim does not contradict itself across rounds. Trade-offs are explicit.
4. evidence_over_slogans — Concrete numbers, named groups, or enforceable steps instead of vibes.
5. anti_troll — No abuse, bait, empty posts, or all-caps noise. Thin filings fail this flag.

confidence_score is how sure you are, from 0.00 to 1.00.
- 0.90–1.00: decisive. Score stands; no addendum.
- 0.60–0.89: marginal. Candidate may file a 150-word addendum on the named flag.
- below 0.60: too thin to appeal. Score stands.`;

export type EvaluationStatus = "evaluated" | "appealed" | "locked";

export function parseScore(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isMarginalConfidence(score: number | string | null | undefined) {
  const value = parseScore(score);
  return value >= MARGINAL_CONFIDENCE_MIN && value <= MARGINAL_CONFIDENCE_MAX;
}

export function canFileAddendum(evaluation: {
  status: string;
  confidence_score: number | string | null;
  ensemble_result?: boolean | null;
} | null | undefined) {
  if (!evaluation) return false;
  if (evaluation.status === "locked") return false;
  if (evaluation.ensemble_result != null) return false;
  if (evaluation.status !== "evaluated" && evaluation.status !== "appealed") {
    return false;
  }
  return isMarginalConfidence(evaluation.confidence_score);
}

export function ensembleTally(passCount: number, failCount: number) {
  const high = Math.max(passCount, failCount);
  const low = Math.min(passCount, failCount);
  return `${high}-${low}` as const;
}

export function majorityPass(votes: boolean[]) {
  const passCount = votes.filter(Boolean).length;
  const failCount = votes.length - passCount;
  return {
    pass: passCount > failCount,
    passCount,
    failCount,
    tally: ensembleTally(passCount, failCount),
  };
}
