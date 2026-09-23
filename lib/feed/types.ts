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
};

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
