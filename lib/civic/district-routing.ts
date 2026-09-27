import {
  classifyOcdLevel,
  normalizeOcdId,
  pickPrimaryOcdId,
  type OcdCycleLevel,
} from "@/lib/civic-fencing";

export type RoutableDistrict = {
  id: string;
  ocdId: string | null;
};

export type RoutableElection = {
  ocdId: string | null;
  districtId: string | null;
};

export type DistrictAssignment = {
  primaryOcdId: string | null;
  federal: string[];
  state: string[];
  municipal: string[];
  districtId: string | null;
};

function group(ids: readonly string[]) {
  const federal: string[] = [];
  const state: string[] = [];
  const municipal: string[] = [];
  for (const id of ids) {
    const level: OcdCycleLevel | null = classifyOcdLevel(id);
    if (level === "federal") federal.push(id);
    else if (level === "state") state.push(id);
    else if (level === "municipal") municipal.push(id);
  }
  return { federal, state, municipal };
}

function bestRow<T>(rows: T[], ocdOf: (row: T) => string | null) {
  const usable = rows.filter((row) => ocdOf(row)?.trim());
  const primary = pickPrimaryOcdId(usable.map((row) => ocdOf(row) ?? ""));
  if (!primary) return null;
  const target = normalizeOcdId(primary);
  return usable.find((row) => normalizeOcdId(ocdOf(row)) === target) ?? null;
}

/** Picks the most specific district whose OCD-ID is on the address, then an election seat. */
export function assignConstituentDistrict(input: {
  ocdIds: readonly string[];
  districts: readonly RoutableDistrict[];
  elections?: readonly RoutableElection[];
}): DistrictAssignment {
  const ocdIds = [...new Set(input.ocdIds.map((id) => id.trim()).filter(Boolean))];
  const known = new Set(ocdIds.map((id) => normalizeOcdId(id)));
  const groups = group(ocdIds);

  const districtHit = bestRow(
    input.districts.filter((district) => district.ocdId && known.has(normalizeOcdId(district.ocdId))),
    (district) => district.ocdId,
  );

  const electionHit = districtHit
    ? null
    : bestRow(
        (input.elections ?? []).filter(
          (election) => election.districtId && election.ocdId && known.has(normalizeOcdId(election.ocdId)),
        ),
        (election) => election.ocdId,
      );

  return {
    primaryOcdId: pickPrimaryOcdId(ocdIds),
    ...groups,
    districtId: districtHit?.id ?? electionHit?.districtId ?? null,
  };
}
