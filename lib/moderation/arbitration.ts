import type { ArbitrationKind, ReportReason, ReportTargetKind } from "@/types/database.types";

export type JuryDecision = "uphold" | "dismiss";

export type ExpiredFloor = {
  id: string;
  status: string;
  candidateAId: string | null;
  candidateBId: string | null;
  expiresAt: string;
  argumentCount: number;
};

export function arbitrationKindForReport(input: {
  targetKind: ReportTargetKind;
  reason: ReportReason;
}): ArbitrationKind | null {
  if (input.reason === "abandoned") return "abandoned_debate";
  if (input.reason === "off_platform" || input.reason === "other") return null;
  if (input.targetKind === "vote") return "flagged_vote";
  return "bad_faith_argument";
}

export function isAbandonedDebate(debate: ExpiredFloor, now: Date) {
  const expires = new Date(debate.expiresAt).getTime();
  if (!Number.isFinite(expires) || expires > now.getTime()) return false;
  if (debate.status === "completed" || debate.status === "expired") return false;
  if (!debate.candidateAId || !debate.candidateBId) return true;
  if (debate.status === "matching") return true;
  return debate.status === "active" && debate.argumentCount === 0;
}

export function debatesToFinalize(
  debates: readonly ExpiredFloor[],
  openHoldIds: ReadonlySet<string>,
  now: Date,
) {
  return debates
    .filter((debate) => debate.status === "voting")
    .filter((debate) => !openHoldIds.has(debate.id))
    .filter((debate) => !isAbandonedDebate(debate, now))
    .map((debate) => debate.id);
}

export function debatesToRelease(
  debates: readonly ExpiredFloor[],
  openHoldIds: ReadonlySet<string>,
  dismissedIds: ReadonlySet<string>,
  now: Date,
) {
  return debates
    .filter((debate) => dismissedIds.has(debate.id) && !openHoldIds.has(debate.id))
    .filter((debate) => debate.status === "matching" || debate.status === "active")
    .filter((debate) => isAbandonedDebate(debate, now))
    .map((debate) => debate.id);
}

export function debatesToHold(
  debates: readonly ExpiredFloor[],
  openHoldIds: ReadonlySet<string>,
  dismissedIds: ReadonlySet<string>,
  now: Date,
) {
  return debates
    .filter((debate) => isAbandonedDebate(debate, now))
    .filter((debate) => !openHoldIds.has(debate.id))
    .filter((debate) => !dismissedIds.has(debate.id))
    .map((debate) => debate.id);
}

export function juryResolutionPlan(kind: ArbitrationKind, decision: JuryDecision) {
  if (decision === "dismiss") {
    return {
      caseStatus: "dismissed" as const,
      holdsElo: false,
      voidFlaggedVote: false,
      debateStatus: "unchanged" as const,
    };
  }

  if (kind === "flagged_vote") {
    return {
      caseStatus: "upheld" as const,
      holdsElo: false,
      voidFlaggedVote: true,
      debateStatus: "unchanged" as const,
    };
  }

  return {
    caseStatus: "upheld" as const,
    holdsElo: true,
    voidFlaggedVote: false,
    debateStatus: "expired" as const,
  };
}
