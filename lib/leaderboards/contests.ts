export const TOP_MATCHED_ELECTIONS = 15;

export type ContestSortId = "primary" | "general" | "debate";

export type ContestRow = {
  electionId: string;
  slug: string;
  officeName: string;
  incumbentName: string | null;
  districtId: string | null;
  districtName: string | null;
  historicalLean: string | null;
  wins: number;
  losses: number;
  eloRating: number;
  primaryMatch: number;
  generalViability: number;
  draftViability: number;
  uncapturedBounty: number;
};

export type ContestProfile = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  eloRating: number;
};

export const CONTEST_SORTS: {
  id: ContestSortId;
  label: string;
}[] = [
  { id: "primary", label: "Highest Primary Alignment" },
  { id: "general", label: "Best General Win Probability" },
  { id: "debate", label: "Debate Dominance" },
];

function winRate(row: ContestRow) {
  const played = row.wins + row.losses;
  if (played <= 0) return 0;
  return row.wins / played;
}

export function sortContests(rows: ContestRow[], sort: ContestSortId) {
  return [...rows].sort((left, right) => {
    if (sort === "primary") {
      if (right.primaryMatch !== left.primaryMatch) {
        return right.primaryMatch - left.primaryMatch;
      }
    } else if (sort === "general") {
      if (right.generalViability !== left.generalViability) {
        return right.generalViability - left.generalViability;
      }
    } else {
      if (right.eloRating !== left.eloRating) {
        return right.eloRating - left.eloRating;
      }
      const winDelta = winRate(right) - winRate(left);
      if (winDelta !== 0) return winDelta;
      if (right.wins !== left.wins) return right.wins - left.wins;
    }

    if (right.draftViability !== left.draftViability) {
      return right.draftViability - left.draftViability;
    }
    return left.officeName.localeCompare(right.officeName);
  });
}
