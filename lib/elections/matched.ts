import { formatDistrictLabel } from "@/lib/ballot/district-label";
import { normalizeOcdId } from "@/lib/civic-fencing";
import {
  activeRaces,
  alignedLane,
  type DirectoryRace,
} from "@/lib/elections/state-directory";
import { euclidean, type AxisPoint } from "@/lib/platform/scoring";
import { stateByCode, stateByName } from "@/lib/platform/states";

export type GeoScope = "backyard" | "state" | "nationwide";
export type OfficeFilter = "all" | RaceTierFilter;
export type ViabilityFilter = "all" | "open";
type RaceTierFilter = "federal" | "state" | "local";

export type MatchedRace = DirectoryRace & {
  incumbentName: string | null;
};

export type RankedMatch = MatchedRace & {
  distance: number;
  alignment: number;
};

const PLANE_SPAN = Math.sqrt(8);
const SPECIFIC_DIVISION = /\/(?:cd|sldu|sldl|place|county|council_district|ward):/i;

export function alignmentPercent(distance: number) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  const ratio = 1 - distance / PLANE_SPAN;
  return Math.round(Math.min(100, Math.max(0, ratio * 100)));
}

export function matchedOfficeLabel(race: Pick<DirectoryRace, "officeName" | "state" | "district">) {
  const office = race.officeName.trim();
  const state = raceStateCode(race.state);
  const district = (race.district ?? "").trim();

  if (/council/i.test(office)) {
    const number = district.match(/\d+/)?.[0];
    if (number && !/district\s+\d+/i.test(office)) return `${office} · District ${Number(number)}`;
    return office;
  }

  if (/\bhouse\b/i.test(office) && !/state\s+house/i.test(office) && district) {
    const label = formatDistrictLabel(state, district);
    return label ? `U.S. House · ${label}` : office;
  }

  if (/state\s+(senate|house)/i.test(office) && district) {
    return `${office} · ${state}-${district.replace(/^0+/, "")}`;
  }

  if (district) {
    const label = formatDistrictLabel(state, district);
    return `${office} · ${label ?? district}`;
  }

  return state ? `${office} · ${state}` : office;
}

export function stateFromHome(homeOcdIds: string[], stateCode?: string | null) {
  const coded = raceStateCode(stateCode ?? "");
  if (coded.length === 2) return coded;
  for (const id of homeOcdIds) {
    const match = normalizeOcdId(id).match(/state:([a-z]{2})\b/);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function raceStateCode(state: string) {
  const trimmed = state.trim();
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return stateByCode(trimmed)?.code ?? stateByName(trimmed)?.code ?? "";
}

function specificHomeIds(homeOcdIds: string[]) {
  const normalized = homeOcdIds.map((id) => normalizeOcdId(id)).filter(Boolean);
  const specific = normalized.filter((id) => SPECIFIC_DIVISION.test(id));
  return specific.length > 0 ? specific : normalized;
}

export function inBackyard(race: Pick<DirectoryRace, "ocdId">, homeOcdIds: string[]) {
  const target = normalizeOcdId(race.ocdId);
  if (!target) return false;
  const homes = specificHomeIds(homeOcdIds);
  if (homes.includes(target)) return true;
  return homes.some(
    (id) => /\/(?:place|county):/i.test(id) && (target === id || target.startsWith(`${id}/`)),
  );
}

export function inHomeState(race: Pick<DirectoryRace, "state" | "tier" | "ocdId">, homeState: string | null, homeOcdIds: string[]) {
  if (!homeState || raceStateCode(race.state) !== homeState) return false;
  if (race.tier === "local") return inBackyard(race, homeOcdIds);
  return true;
}

export function filterMatchedRaces(
  races: MatchedRace[],
  filters: { scope: GeoScope; level: OfficeFilter; viability: ViabilityFilter },
  home: { ocdIds: string[]; state: string | null },
) {
  return activeRaces(races).filter((race) => {
    if (filters.level !== "all" && race.tier !== filters.level) return false;
    if (filters.viability === "open" && race.incumbentName) return false;
    if (filters.scope === "nationwide") return true;
    if (filters.scope === "state") return inHomeState(race, home.state, home.ocdIds);
    return inBackyard(race, home.ocdIds);
  });
}

export function rankMatchedRaces(races: MatchedRace[], viewer: AxisPoint, limit = 24): RankedMatch[] {
  return races
    .map((race) => {
      const lane = alignedLane(race, viewer);
      const baseline = lane ? { x: lane.baselineX, y: lane.baselineY } : { x: 0, y: 0 };
      const distance = euclidean(viewer, baseline);
      return { ...race, distance, alignment: alignmentPercent(distance) };
    })
    .sort((left, right) => right.alignment - left.alignment || left.officeName.localeCompare(right.officeName))
    .slice(0, limit);
}
