import { parseElo } from "@/lib/arena/elo";
import { ocdFenceSpecificity } from "@/lib/civic-fencing";
import { projectContestOutlook } from "@/lib/electability";
import { sixAxisMatchPercent, toSixAxisVector } from "@/lib/ideology/six-axis";
import { calculateDraftViabilityScore } from "@/lib/math/viability";

export type DraftRaceSource = {
  id: string;
  slug: string;
  officeName: string;
  incumbentName: string | null;
  ocdId: string | null;
  districtName: string | null;
  districtState: string | null;
  pviScore: number | null;
  medianVoterVector: unknown;
};

export type ViableRace = {
  electionId: string;
  slug: string;
  officeName: string;
  incumbentName: string | null;
  districtName: string | null;
  viability: number;
  primaryMatch: number;
  generalViability: number;
};

type ScoredRace = ViableRace & { specificity: number };

function tightestFence<T extends { specificity: number }>(rows: T[], limit: number) {
  const floors = [...new Set(rows.map((row) => row.specificity))].sort((left, right) => right - left);
  let pool: T[] = [];
  for (const floor of floors) {
    const next = rows.filter((row) => row.specificity >= floor);
    if (next.length === 0) continue;
    pool = next;
    if (pool.length >= limit) break;
  }
  return pool;
}

/** Top races inside the verified OCD fence, ordered by draft viability. */
export function rankViableRaces(input: {
  ocdIds: readonly string[];
  ideologyVector: unknown;
  eloRating: number;
  races: DraftRaceSource[];
  limit?: number;
}): ViableRace[] {
  const limit = input.limit ?? 3;
  const eloRating = parseElo(input.eloRating);
  const userVector = toSixAxisVector(input.ideologyVector);

  const scored: ScoredRace[] = [];
  for (const race of input.races) {
    const specificity = ocdFenceSpecificity({
      ocdIds: input.ocdIds,
      electionOcdId: race.ocdId,
      officeName: race.officeName,
      districtName: race.districtName,
      districtState: race.districtState,
    });
    if (specificity <= 0) continue;

    const primaryMatch = sixAxisMatchPercent(
      userVector,
      toSixAxisVector(race.medianVoterVector),
    );
    const outlook = projectContestOutlook({
      pviScore: race.pviScore,
      matchPercent: primaryMatch,
      ideologyVector: input.ideologyVector,
    });
    const viability = calculateDraftViabilityScore({
      primaryMatch,
      generalViability: outlook.generalPct,
      eloRating,
    });

    scored.push({
      electionId: race.id,
      slug: race.slug,
      officeName: race.officeName,
      incumbentName: race.incumbentName,
      districtName: race.districtName,
      viability,
      primaryMatch,
      generalViability: outlook.generalPct,
      specificity,
    });
  }

  return tightestFence(scored, limit)
    .sort((left, right) => {
      if (right.viability !== left.viability) return right.viability - left.viability;
      if (right.primaryMatch !== left.primaryMatch) return right.primaryMatch - left.primaryMatch;
      return left.officeName.localeCompare(right.officeName);
    })
    .slice(0, limit)
    .map((race) => ({
      electionId: race.electionId,
      slug: race.slug,
      officeName: race.officeName,
      incumbentName: race.incumbentName,
      districtName: race.districtName,
      viability: race.viability,
      primaryMatch: race.primaryMatch,
      generalViability: race.generalViability,
    }));
}
