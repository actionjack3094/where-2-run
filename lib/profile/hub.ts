export type DraftBounty = {
  id: string;
  amount: number;
  unlockLabel: string;
  officeName: string | null;
  donorName: string;
};

export type MatchedElection = {
  id: string;
  slug: string;
  officeName: string;
  level: string;
  state: string | null;
};

/** A race on the user's matched ballot, with their campaign target if they have one. */
export type MatchedRace = {
  electionId: string;
  slug: string;
  officeName: string;
  ocdId: string | null;
  level: string | null;
  targetId: string | null;
  status: string | null;
  alignmentStreak: number;
  isLocked: boolean;
  /** Dollars in pledges released on this race (streak reached 10). */
  releasedAmount: number;
};

export type CoalitionContact = {
  id: string;
  name: string;
  role: "follower" | "ally";
  ideologyVector: number[];
};

export type ProfileHubData = {
  signedIn: true;
  userId: string;
  username: string;
  bio: string | null;
  wins: number;
  losses: number;
  eloRating: number;
  ideologyVector: number[];
  bounties: DraftBounty[];
  election: MatchedElection | null;
  matchedRaces: MatchedRace[];
  network: CoalitionContact[];
  error: string | null;
};

export type ProfileHub = { signedIn: false } | ProfileHubData;
