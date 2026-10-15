export type ElectionsTab = "matched" | "ballot" | "directory";

export type MatchedPrimaryCard = {
  id: string;
  title: string;
  match: number;
  question: string;
  floorHref: string;
  campaignHref: string;
};

export type VoterBallotCandidate = {
  id: string;
  name: string;
  party: string;
  tierLabel: string;
  primaryId: string;
  pledged: number;
  canPledge: boolean;
};

export type VoterBallotRace = {
  id: string;
  title: string;
  question: string | null;
  qaHref: string | null;
  candidates: VoterBallotCandidate[];
};

export type VoterBallotPanel = {
  signedOut: boolean;
  needsZip: boolean;
  districtLabel: string | null;
  races: VoterBallotRace[];
  notice: string | null;
};

export function parseElectionsTab(value: string | undefined): ElectionsTab {
  if (value === "ballot" || value === "directory") return value;
  return "matched";
}
