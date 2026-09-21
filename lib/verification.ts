export const VERIFICATION_TIERS = [
  "unverified",
  "phone_verified",
  "voter_verified",
  "candidate_verified",
] as const;

export type VerificationTier = (typeof VERIFICATION_TIERS)[number];

export const TIER_RANK: Record<VerificationTier, number> = {
  unverified: 0,
  phone_verified: 1,
  voter_verified: 2,
  candidate_verified: 3,
};

export const CIVIC_FENCE_HINT =
  "Verify your voter registration to participate in District Watch.";

export type VerificationStep = {
  tier: Exclude<VerificationTier, "unverified">;
  step: number;
  title: string;
  method: string;
  unlocks: string;
  mockLabel: string;
  mockPending: string;
};

export const VERIFICATION_STEPS: VerificationStep[] = [
  {
    tier: "phone_verified",
    step: 1,
    title: "Baseline identity",
    method: "SMS confirmation",
    unlocks: "Confirms a working phone number so the campaign can reach you.",
    mockLabel: "Simulate SMS verification",
    mockPending: "Confirming SMS…",
  },
  {
    tier: "voter_verified",
    step: 2,
    title: "Voting rights",
    method: "Voter registration file match",
    unlocks: "Unlocks Vote and Comment on District Watch posts.",
    mockLabel: "Simulate voter file match",
    mockPending: "Matching the file…",
  },
  {
    tier: "candidate_verified",
    step: 3,
    title: "Ballot access",
    method: "Government ID review",
    unlocks: "Marks the campaign as identity-checked for filing and ballot access.",
    mockLabel: "Simulate government ID review",
    mockPending: "Reviewing ID…",
  },
];

export function isMissingVerificationColumn(
  error: { message?: string; code?: string } | null,
) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /verification_tier/i.test(message)
  );
}

export function parseVerificationTier(value: unknown): VerificationTier {
  if (
    value === "phone_verified" ||
    value === "voter_verified" ||
    value === "candidate_verified"
  ) {
    return value;
  }
  return "unverified";
}

export function meetsVerificationTier(
  current: unknown,
  required: VerificationTier,
) {
  return TIER_RANK[parseVerificationTier(current)] >= TIER_RANK[required];
}

export function hasTrustBadge(tier: unknown) {
  return meetsVerificationTier(tier, "voter_verified");
}

export function nextVerificationTier(
  current: unknown,
): Exclude<VerificationTier, "unverified"> | null {
  const rank = TIER_RANK[parseVerificationTier(current)];
  return VERIFICATION_STEPS.find((step) => TIER_RANK[step.tier] === rank + 1)?.tier ?? null;
}

export function verificationLabel(tier: unknown) {
  const parsed = parseVerificationTier(tier);
  if (parsed === "candidate_verified") return "Candidate verified";
  if (parsed === "voter_verified") return "Voter verified";
  if (parsed === "phone_verified") return "Phone verified";
  return "Unverified";
}
