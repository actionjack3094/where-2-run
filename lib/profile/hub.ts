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
  network: CoalitionContact[];
  error: string | null;
};

export type ProfileHub = { signedIn: false } | ProfileHubData;
