import { rankMatchedRaces, type MatchedRace } from "@/lib/elections/matched";
import {
  alignedLane,
  groupGeneralRaces,
  primaryOfficeName,
  type DirectoryPrimary,
} from "@/lib/elections/state-directory";
import { loadPrimaries, loadProfile, platformAdmin } from "@/lib/platform/records";
import { partyFromCoordinate, type AxisPoint, type Party } from "@/lib/platform/scoring";
import type { Primary } from "@/types/database.types";

export type MatchedPrimaryScope = {
  calibrated: boolean;
  party: Party | null;
  ids: Set<string>;
};

const EMPTY: MatchedPrimaryScope = { calibrated: false, party: null, ids: new Set() };

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDirectoryPrimary(primary: Primary): DirectoryPrimary {
  return {
    id: primary.id,
    party: primary.party,
    officeName: primaryOfficeName(primary.office_name, primary.office),
    state: primary.state,
    district: primary.district,
    slug: primary.slug,
    generalSlug: primary.general_slug,
    baselineX: finite(primary.baseline_x),
    baselineY: finite(primary.baseline_y),
    status: primary.status,
    level: primary.level ?? null,
    cycleYear: finite(primary.cycle_year),
    ocdId: primary.ocd_id,
  };
}

/** Same-party lane ids from the viewer's matched primaries. The other party's seat is left out. */
export function matchedPrimaryIds(primaries: DirectoryPrimary[], viewer: AxisPoint) {
  const party = partyFromCoordinate(viewer);
  const races: MatchedRace[] = groupGeneralRaces(primaries).map((race) => ({
    ...race,
    incumbentName: null,
  }));
  const ids = new Set<string>();
  for (const race of rankMatchedRaces(races, viewer)) {
    const lane = alignedLane(race, viewer);
    if (lane?.party === party) ids.add(lane.id);
  }
  return ids;
}

export async function loadMatchedPrimaryIds(userId: string | null): Promise<MatchedPrimaryScope> {
  if (!userId) return EMPTY;
  const admin = platformAdmin();
  const [profile, primaries] = await Promise.all([
    loadProfile(admin, userId),
    loadPrimaries(admin),
  ]);
  if (profile?.ideology_x == null || profile.ideology_y == null) return EMPTY;
  const viewer = { x: profile.ideology_x, y: profile.ideology_y };
  return {
    calibrated: true,
    party: partyFromCoordinate(viewer),
    ids: matchedPrimaryIds(primaries.map(toDirectoryPrimary), viewer),
  };
}
