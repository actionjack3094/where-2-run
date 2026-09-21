import type { DebateCandidate, DebateEvaluation } from "@/types/database.types";

export type ArenaFeedCandidate = DebateCandidate & {
  elo_rating: number;
};

export type ArenaFeedDebate = {
  id: string;
  topic: string;
  status: string;
  current_round: number;
  expires_at: string;
  created_at: string;
  districtId: string | null;
  districtName: string | null;
  matchPercent: number | null;
  candidateA: ArenaFeedCandidate | null;
  candidateB: ArenaFeedCandidate | null;
  evaluations: DebateEvaluation[];
};

export type ArenaFeedResult = {
  debates: ArenaFeedDebate[];
  error: string | null;
};
