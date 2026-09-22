import type { DebateCandidate, VerificationTier } from "@/types/database.types";
import type { SixAxisId, SixAxisVector } from "@/lib/ideology/six-axis";

export const SOCIAL_FEED_PAGE_SIZE = 10;
export const IDEOLOGY_EMA_ALPHA = 0.25;

export type SocialFeedDebateItem = {
  kind: "debate";
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

export type SocialFeedStanceItem = {
  kind: "stance";
  id: string;
  createdAt: string;
  title: string;
  body: string;
  status: string;
  districtName: string;
  electionSlug: string | null;
  author: DebateCandidate | null;
};

export type SocialFeedItem = SocialFeedDebateItem | SocialFeedStanceItem;

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
  calibration: CalibrationPrompt;
};

export type StanceAssignment = {
  topic: string;
  keywords: string[];
  jurisdiction: "local" | "state" | "federal";
  geography: string[];
  officeHint: string;
  electionId: string | null;
  vector: SixAxisVector;
};
