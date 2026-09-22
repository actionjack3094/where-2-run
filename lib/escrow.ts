export const BOUNTY_UNLOCK_CONDITIONS = [
  {
    id: "candidate_declares",
    label: "Candidate formally declares",
  },
  {
    id: "ballot_access_filed",
    label: "Candidate files for ballot access",
  },
  {
    id: "debate_won",
    label: "Candidate wins this debate",
  },
  {
    id: "grassroots_threshold",
    label: "Campaign clears the $5,000 grassroots threshold",
  },
] as const;

export type BountyUnlockConditionId =
  (typeof BOUNTY_UNLOCK_CONDITIONS)[number]["id"];

const CONDITION_BY_ID = new Map(
  BOUNTY_UNLOCK_CONDITIONS.map((condition) => [condition.id, condition] as const),
);

export function isBountyUnlockConditionId(
  value: string | null | undefined,
): value is BountyUnlockConditionId {
  return Boolean(value && CONDITION_BY_ID.has(value as BountyUnlockConditionId));
}

export function unlockConditionLabel(value: string | null | undefined) {
  if (!value) return null;
  return CONDITION_BY_ID.get(value as BountyUnlockConditionId)?.label ?? value;
}
