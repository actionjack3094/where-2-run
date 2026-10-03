import type { CandidateTierName, Party } from "@/lib/platform/scoring";

export type PublicJudgment = {
  outcome: "win" | "loss" | "tie";
  eloDelta: number;
  coordinate: { x: number; y: number };
};

export type ArenaSide = {
  id: string;
  name: string;
  avatarUrl: string | null;
  tier: CandidateTierName;
  verified: boolean;
  donationHref: string | null;
};

export type CrowdFavorite = {
  name: string;
  percent: number;
} | null;

export type BallotComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type BallotMatch = {
  id: string;
  primarySlug: string;
  officeName: string;
  state: string;
  district: string | null;
  prompt: string;
  stanceA: string;
  stanceB: string | null;
  sideA: ArenaSide;
  sideB: ArenaSide;
  status: string;
  isTie: boolean;
  winnerId: string | null;
  crowd: CrowdFavorite;
  priority: boolean;
  comments: BallotComment[];
  viewerSupportId: string | null;
};

export type ArenaCard = {
  id: string;
  primaryId: string;
  primarySlug: string;
  officeName: string;
  party: Party;
  distance: number;
  prompt: string;
  stanceA: string;
  sideA: ArenaSide;
  sideB: ArenaSide | null;
  status: string;
  seatLockedUntil: string | null;
  isTie: boolean;
  winnerId: string | null;
};

export type LeaderRow = {
  userId: string;
  legalName: string | null;
  displayName: string;
  avatarUrl: string | null;
  civicStanding: number;
  debatesLogged: number;
  policyConsistency: number;
  ties: number;
  tier: CandidateTierName;
  verified: boolean;
  ranked: boolean;
  isNominee: boolean;
};

export type PrimaryHub = {
  id: string;
  slug: string;
  party: Party | "nonpartisan";
  officeName: string;
  state: string;
  district: string | null;
  level: "federal" | "state" | "local";
  ocdId: string;
  baselineX: number;
  baselineY: number;
  generalSlug: string;
  cycleYear: number;
  primaryDate: string;
  status: string;
  closed: boolean;
  counterpartySlug: string | null;
  counterpartyParty: string | null;
  leaderboard: LeaderRow[];
  unranked: LeaderRow[];
  openSeats: ArenaCard[];
};

export function formatCoordinate(x: number, y: number) {
  const econ = x.toFixed(2);
  const social = y.toFixed(2);
  return `Economic ${econ} · Social ${social}`;
}

export function partyLabel(party: string) {
  if (party === "republican") return "Republican";
  if (party === "nonpartisan") return "Nonpartisan";
  return "Democratic";
}

export function tierLabel(tier: CandidateTierName) {
  if (tier === "frontrunner") return "Frontrunner";
  if (tier === "declared_candidate") return "Declared Candidate";
  return "Pundit";
}
