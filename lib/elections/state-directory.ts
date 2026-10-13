import { euclidean, partyFromCoordinate, type AxisPoint } from "@/lib/platform/scoring";
import { inferElectionLevel, type ElectionLevel } from "@/lib/platform/states";

export type RaceTier = ElectionLevel;

const RECOGNIZED_OFFICE =
  /governor|attorney general|state senate|state house|lieutenant|mayor|council|school|county|municipal|city|senate|house|president|congress/i;

export type DirectoryPrimary = {
  id: string;
  party: string;
  officeName: string;
  state: string;
  district: string | null;
  slug: string;
  generalSlug: string;
  baselineX: number;
  baselineY: number;
  status: string;
  level: string | null;
  cycleYear: number;
  ocdId?: string;
};

export type DirectoryLane = {
  id: string;
  party: string;
  slug: string;
  baselineX: number;
  baselineY: number;
};

export type DirectoryRace = {
  generalSlug: string;
  officeName: string;
  state: string;
  district: string | null;
  tier: RaceTier;
  active: boolean;
  lanes: DirectoryLane[];
  ocdId: string;
};

export type RankedRace = DirectoryRace & { distance: number };

const PARTY_ORDER = ["democrat", "republican", "nonpartisan"];

/** Governor and U.S. Senate. State senate, the House, and local offices stay off this queue. */
export function isMacroStatewideOffice(officeName: string) {
  const office = officeName.trim();
  if (/lieutenant/i.test(office)) return false;
  if (/state\s+senate/i.test(office)) return false;
  if (/\bgovernor\b/i.test(office)) return true;
  return /\b(?:u\.?\s*s\.?|united states)\s+senate\b/i.test(office);
}

export function directoryTier(officeName: string, storedLevel?: string | null): RaceTier {
  if (RECOGNIZED_OFFICE.test(officeName)) return inferElectionLevel(officeName);
  if (storedLevel === "federal" || storedLevel === "state" || storedLevel === "local") return storedLevel;
  return inferElectionLevel(officeName);
}

/** Prefer the office name. The ballot label defaults to U.S. Senate on older rows. */
export function primaryOfficeName(officeName: string | null | undefined, ballotLabel?: string | null) {
  const name = officeName?.trim();
  if (name) return name;
  return ballotLabel?.trim() || "Primary";
}

export function isActivePrimary(status: string) {
  const value = status.trim().toLowerCase();
  return value === "" || value === "active";
}

export function groupGeneralRaces(primaries: DirectoryPrimary[]): DirectoryRace[] {
  const groups = new Map<string, DirectoryPrimary[]>();
  for (const primary of primaries) {
    const key = primary.generalSlug.trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(primary);
    groups.set(key, list);
  }

  const races: DirectoryRace[] = [];
  for (const [generalSlug, rows] of groups) {
    const first = rows[0];
    const byParty = new Map<string, DirectoryPrimary>();
    for (const row of rows) {
      const current = byParty.get(row.party);
      if (!current || row.cycleYear >= current.cycleYear) byParty.set(row.party, row);
    }
    const lanes = [...byParty.values()]
      .sort((left, right) => PARTY_ORDER.indexOf(left.party) - PARTY_ORDER.indexOf(right.party))
      .map((row) => ({
        id: row.id,
        party: row.party,
        slug: row.slug,
        baselineX: row.baselineX,
        baselineY: row.baselineY,
      }));
    const anchor = rows.reduce((best, row) => (row.cycleYear >= best.cycleYear ? row : best), first);
    races.push({
      generalSlug,
      officeName: anchor.officeName,
      state: anchor.state,
      district: anchor.district,
      tier: directoryTier(anchor.officeName, anchor.level),
      active: rows.some((row) => isActivePrimary(row.status)),
      lanes,
      ocdId: anchor.ocdId?.trim() || "",
    });
  }

  return races.sort((left, right) => {
    const office = left.officeName.localeCompare(right.officeName);
    if (office !== 0) return office;
    return (left.district ?? "").localeCompare(right.district ?? "");
  });
}

export function activeRaces(races: DirectoryRace[]) {
  return races.filter((race) => race.active && race.lanes.length > 0);
}

export function countByTier(races: DirectoryRace[]): Record<RaceTier, number> {
  const counts: Record<RaceTier, number> = { federal: 0, state: 0, local: 0 };
  for (const race of activeRaces(races)) counts[race.tier] += 1;
  return counts;
}

function alignmentBaseline(race: DirectoryRace, viewer: AxisPoint): AxisPoint {
  const party = partyFromCoordinate(viewer);
  const same = race.lanes.find((lane) => lane.party === party);
  if (same) return { x: same.baselineX, y: same.baselineY };
  let nearest = race.lanes[0];
  let best = euclidean(viewer, { x: nearest.baselineX, y: nearest.baselineY });
  for (const lane of race.lanes.slice(1)) {
    const distance = euclidean(viewer, { x: lane.baselineX, y: lane.baselineY });
    if (distance < best) {
      best = distance;
      nearest = lane;
    }
  }
  return { x: nearest.baselineX, y: nearest.baselineY };
}

/** Races ordered by Euclidean distance from the viewer's vector to their party's primary baseline. */
export function closestRaces(races: DirectoryRace[], viewer: AxisPoint, limit = 8): RankedRace[] {
  return activeRaces(races)
    .map((race) => ({
      ...race,
      distance: euclidean(viewer, alignmentBaseline(race, viewer)),
    }))
    .sort((left, right) => left.distance - right.distance || left.officeName.localeCompare(right.officeName))
    .slice(0, limit);
}

export function alignedLane(race: DirectoryRace, viewer: AxisPoint | null) {
  if (!viewer) return race.lanes[0] ?? null;
  const party = partyFromCoordinate(viewer);
  return race.lanes.find((lane) => lane.party === party) ?? race.lanes[0] ?? null;
}
