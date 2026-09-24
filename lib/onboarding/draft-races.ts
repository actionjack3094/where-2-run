import { ocdFenceSpecificity } from "@/lib/civic-fencing";
import { calculateDraftViability, type GeneralPath, type PartyLane } from "@/lib/math/viability";

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
  primaryRepVector?: unknown;
  primaryDemVector?: unknown;
  generalVector?: unknown;
};

export type ViableRace = {
  electionId: string;
  slug: string;
  officeName: string;
  incumbentName: string | null;
  districtName: string | null;
  viability: number;
  /** Primary-lane fit, shown as Primary Win Odds. */
  primaryMatch: number;
  generalViability: number;
  generalPath: GeneralPath;
  lane: PartyLane;
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

function byViability(left: ScoredRace, right: ScoredRace) {
  if (right.viability !== left.viability) return right.viability - left.viability;
  if (right.primaryMatch !== left.primaryMatch) return right.primaryMatch - left.primaryMatch;
  return left.officeName.localeCompare(right.officeName);
}

function toViableRace(race: ScoredRace): ViableRace {
  return {
    electionId: race.electionId,
    slug: race.slug,
    officeName: race.officeName,
    incumbentName: race.incumbentName,
    districtName: race.districtName,
    viability: race.viability,
    primaryMatch: race.primaryMatch,
    generalViability: race.generalViability,
    generalPath: race.generalPath,
    lane: race.lane,
  };
}

/**
 * US House (and US Senate) seats are a nationwide tier. State senate and
 * city council stay inside the verified fence.
 */
export function isFederalDraftSeat(race: Pick<DraftRaceSource, "ocdId" | "officeName" | "districtName">) {
  const ocd = (race.ocdId ?? "").toLowerCase();
  if (/\/cd:/.test(ocd) || /\/senate:/.test(ocd)) return true;

  const haystack = `${race.officeName} ${race.districtName ?? ""}`.toLowerCase();
  if (/\bstate\b/.test(haystack) && /\b(senate|house|assembly)\b/.test(haystack)) return false;
  return /\bu\.?s\.?\s+house\b|\bu\.?s\.?\s+senate\b|\bcongressional\b/.test(haystack);
}

function scoreRace(race: DraftRaceSource, ideologyVector: unknown, specificity: number): ScoredRace {
  const funnel = calculateDraftViability({
    ideologyVector,
    primaryRepVector: race.primaryRepVector,
    primaryDemVector: race.primaryDemVector,
    generalVector: race.generalVector ?? race.medianVoterVector,
    pviScore: race.pviScore,
  });

  return {
    electionId: race.id,
    slug: race.slug,
    officeName: race.officeName,
    incumbentName: race.incumbentName,
    districtName: race.districtName,
    viability: funnel.viability,
    primaryMatch: funnel.primaryFit,
    generalViability: funnel.generalViability,
    generalPath: funnel.generalPath,
    lane: funnel.lane,
    specificity,
  };
}

/**
 * Two-stage draft card.
 * Federal seats skip the home-state fence and contribute the single highest
 * nationwide viability score. State and local seats must sit inside the
 * verified OCD fence. The card is those results merged, highest viability first.
 */
export function rankViableRaces(input: {
  ocdIds: readonly string[];
  ideologyVector: unknown;
  races: DraftRaceSource[];
  limit?: number;
}): ViableRace[] {
  const limit = input.limit ?? 3;
  const federal: DraftRaceSource[] = [];
  const regional: DraftRaceSource[] = [];

  for (const race of input.races) {
    if (isFederalDraftSeat(race)) federal.push(race);
    else regional.push(race);
  }

  const federalPick = federal
    .map((race) => scoreRace(race, input.ideologyVector, 1))
    .sort(byViability)
    .slice(0, 1);

  const regionalScored: ScoredRace[] = [];
  for (const race of regional) {
    const specificity = ocdFenceSpecificity({
      ocdIds: input.ocdIds,
      electionOcdId: race.ocdId,
      officeName: race.officeName,
      districtName: race.districtName,
      districtState: race.districtState,
    });
    if (specificity <= 0) continue;
    regionalScored.push(scoreRace(race, input.ideologyVector, specificity));
  }

  const regionalLimit = Math.max(0, limit - federalPick.length);
  const regionalPicks = tightestFence(regionalScored, regionalLimit)
    .sort(byViability)
    .slice(0, regionalLimit);

  return [...federalPick, ...regionalPicks].sort(byViability).map(toViableRace);
}
