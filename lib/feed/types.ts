import type { DebateCandidate, VerificationTier } from "@/types/database.types";
import type { JurisdictionalLevel } from "@/lib/debates/prompt-classification";
import type { SixAxisId, SixAxisVector } from "@/lib/ideology/six-axis";

export const SOCIAL_FEED_PAGE_SIZE = 10;
export const IDEOLOGY_EMA_ALPHA = 0.25;
/** Two-stage composite must clear this percent before a question enters candidate mode. */
export const CANDIDATE_VIABILITY_GATE = 50;

export type RedFeedQuestion = {
  loop: "red";
  id: string;
  createdAt: string;
  prompt: string;
  electionId: string;
  electionSlug: string | null;
  districtName: string;
  jurisdictionalLevel: JurisdictionalLevel;
  primaryAxis: SixAxisId;
  informationGainScore: number;
  /** Waiting debate in the viewer's district that still needs a candidate_b. */
  waitingDebateId: string | null;
  waitingOpponentName: string | null;
  /** The viewer already opened this question and is waiting for a challenger. */
  viewerHoldsFloor: boolean;
};

/**
 * Annotate questions with any waiting debate. Questions that have no debate
 * rows stay in the list as an open floor.
 */
export function applyWaitingFloors<T extends Pick<RedFeedQuestion, "id" | "waitingDebateId" | "waitingOpponentName" | "viewerHoldsFloor">>(
  items: readonly T[],
  floors: readonly {
    id: string;
    electionQuestionId: string | null;
    candidateAId: string | null;
    opponentName: string | null;
  }[],
  viewerId: string,
): T[] {
  const byQuestion = new Map<string, (typeof floors)[number][]>();
  for (const floor of floors) {
    if (!floor.electionQuestionId) continue;
    const list = byQuestion.get(floor.electionQuestionId) ?? [];
    list.push(floor);
    byQuestion.set(floor.electionQuestionId, list);
  }

  return items.map((item) => {
    const rows = byQuestion.get(item.id) ?? [];
    const challenge = rows.find((row) => row.candidateAId && row.candidateAId !== viewerId);
    const held = rows.find((row) => row.candidateAId === viewerId);
    if (challenge) {
      return {
        ...item,
        waitingDebateId: challenge.id,
        waitingOpponentName: challenge.opponentName,
        viewerHoldsFloor: false,
      };
    }
    if (held) {
      return { ...item, waitingDebateId: null, waitingOpponentName: null, viewerHoldsFloor: true };
    }
    return { ...item, waitingDebateId: null, waitingOpponentName: null, viewerHoldsFloor: false };
  });
}

/** Open floor starts a thread. A waiting opponent is an existing challenge. */
export function questionFloorMode(question: Pick<RedFeedQuestion, "waitingDebateId" | "viewerHoldsFloor">) {
  if (question.waitingDebateId) return "challenge" as const;
  if (question.viewerHoldsFloor) return "holding" as const;
  return "open" as const;
}

export type BlueFeedDebate = {
  loop: "blue";
  id: string;
  createdAt: string;
  title: string;
  status: string;
  districtName: string;
  electionSlug: string | null;
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  votingOpen: boolean;
};

export type SocialFeedItem = RedFeedQuestion | BlueFeedDebate;

export function passesViabilityGate(viability: number) {
  return Number.isFinite(viability) && viability > CANDIDATE_VIABILITY_GATE;
}

/** Zip candidate questions (information gain) with jury debates (recency). */
export function mergeFeedTimeline(
  red: readonly RedFeedQuestion[],
  blue: readonly BlueFeedDebate[],
) {
  const items: SocialFeedItem[] = [];
  const length = Math.max(red.length, blue.length);
  for (let index = 0; index < length; index += 1) {
    const question = red[index];
    const debate = blue[index];
    if (question) items.push(question);
    if (debate) items.push(debate);
  }
  return items;
}

export type CalibrationOption = {
  id: string;
  label: string;
  score: number;
};

export type CalibrationPrompt = {
  id: string;
  axisId: SixAxisId;
  axisIndex: number;
  issueLabel: string;
  prompt: string;
  options: CalibrationOption[];
};

export type SocialFeedResult = {
  items: SocialFeedItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  error: string | null;
  viewerTier: VerificationTier;
  viewerOcdIdentifiers: string[];
  calibration: CalibrationPrompt;
};

export type StanceAssignment = {
  topic: string;
  keywords: string[];
  jurisdiction: "local" | "state" | "federal";
  geography: string[];
  officeHint: string;
  electionId: string | null;
  /** True when the extractor could not pick one race with a clear lead. */
  ambiguous: boolean;
  vector: SixAxisVector;
};
