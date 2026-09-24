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

type DraftSeatTier = "federal" | "state" | "local";

type ScoredRace = ViableRace & {
  tier: DraftSeatTier;
  inFence: boolean;
};

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

function isStateDraftSeat(race: Pick<DraftRaceSource, "ocdId" | "officeName" | "districtName">) {
  const ocd = (race.ocdId ?? "").toLowerCase();
  if (/\/sld[ul]:/.test(ocd) || /\/state:[a-z]{2}$/.test(ocd)) return true;

  const haystack = `${race.officeName} ${race.districtName ?? ""}`.toLowerCase();
  if (/\bgovernor\b/.test(haystack)) return true;
  return /\bstate\b/.test(haystack) && /\b(senate|house|assembly|legislature)\b/.test(haystack);
}

function seatTier(race: Pick<DraftRaceSource, "ocdId" | "officeName" | "districtName">): DraftSeatTier {
  if (isFederalDraftSeat(race)) return "federal";
  if (isStateDraftSeat(race)) return "state";
  return "local";
}

function pickTop(rows: readonly ScoredRace[]) {
  return [...rows].sort(byViability)[0] ?? null;
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

function scoreRace(
  race: DraftRaceSource,
  ideologyVector: unknown,
  tier: DraftSeatTier,
  inFence: boolean,
): ScoredRace {
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
    tier,
    inFence,
  };
}

/**
 * Three-slot draft card, chosen as a tiered ladder:
 * federal (nationwide), state (OCD fence), then local (OCD fence).
 * If state or local has no fenced match, open slots backfill from the
 * next-highest viability races across every scored district.
 * The card is returned highest viability first.
 */
export function rankViableRaces(input: {
  ocdIds: readonly string[];
  ideologyVector: unknown;
  races: DraftRaceSource[];
  limit?: number;
}): ViableRace[] {
  const limit = input.limit ?? 3;
  const scored: ScoredRace[] = [];

  for (const race of input.races) {
    const tier = seatTier(race);
    const inFence =
      tier === "federal" ||
      ocdFenceSpecificity({
        ocdIds: input.ocdIds,
        electionOcdId: race.ocdId,
        officeName: race.officeName,
        districtName: race.districtName,
        districtState: race.districtState,
      }) > 0;
    scored.push(scoreRace(race, input.ideologyVector, tier, inFence));
  }

  const fenced = (tier: DraftSeatTier) => scored.filter((race) => race.tier === tier && race.inFence);
  const selected: ScoredRace[] = [];
  const seen = new Set<string>();

  for (const tier of ["federal", "state", "local"] as const) {
    const winner = pickTop(fenced(tier));
    if (!winner || seen.has(winner.electionId)) continue;
    selected.push(winner);
    seen.add(winner.electionId);
  }

  const stateMissing = fenced("state").length === 0;
  const localMissing = fenced("local").length === 0;
  if ((stateMissing || localMissing) && selected.length < limit) {
    const backfill = scored.filter((race) => !seen.has(race.electionId)).sort(byViability);
    for (const race of backfill) {
      if (selected.length >= limit) break;
      selected.push(race);
      seen.add(race.electionId);
    }
  }

  return selected.sort(byViability).slice(0, limit).map(toViableRace);
}
