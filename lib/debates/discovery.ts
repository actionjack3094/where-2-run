export type DiscoverySeat = {
  id: string;
  username: string;
  elo: number;
};

export type DiscoveryDebate = {
  id: string;
  topic: string;
  status: string;
  createdAt: string;
  districtTag: string;
  ocdId: string | null;
  electionSlug: string | null;
  candidateA: DiscoverySeat | null;
  candidateB: DiscoverySeat | null;
  winnerId: string | null;
  judgeReasoning: string | null;
  votesA: number;
  votesB: number;
};

export type DiscoveryFilter = "all" | "live" | "concluded" | "upcoming";

const CONCLUDED = new Set(["concluded", "resolved", "completed", "expired"]);
const UPCOMING = new Set(["waiting", "matching"]);

export function discoveryBucket(
  debate: Pick<DiscoveryDebate, "status" | "candidateA" | "candidateB">,
): Exclude<DiscoveryFilter, "all"> {
  if (CONCLUDED.has(debate.status)) return "concluded";
  if (!debate.candidateA || !debate.candidateB || UPCOMING.has(debate.status)) {
    return "upcoming";
  }
  return "live";
}
