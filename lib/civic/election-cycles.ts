import { classifyOcdLevel, normalizeOcdId, type OcdCycleLevel } from "@/lib/civic-fencing";

export type CivicDataSource = "google_civic" | "democracy_works";

export type ElectionCycleDraft = {
  source: CivicDataSource;
  externalId: string;
  name: string;
  electionDay: string;
  ocdId: string;
  level: OcdCycleLevel;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

type GoogleElection = {
  id?: string;
  name?: string;
  electionDay?: string;
  ocdDivisionId?: string;
};

type DemocracyWorksDivision = {
  "ocd-id"?: string;
  ocdId?: string;
  ocdDivisionId?: string;
};

type DemocracyWorksElection = {
  id?: string | number;
  name?: string;
  description?: string;
  date?: string;
  election_date?: string;
  electionDay?: string;
  ocdDivisionId?: string;
  "ocd-id"?: string;
  districtDivisions?: DemocracyWorksDivision[];
  "district-divisions"?: DemocracyWorksDivision[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function electionList(payload: unknown): unknown[] {
  const record = asRecord(payload);
  const elections = record?.elections;
  return Array.isArray(elections) ? elections : [];
}

function draftFor(
  source: CivicDataSource,
  externalId: string,
  name: string,
  electionDay: string,
  ocdId: string,
): ElectionCycleDraft | null {
  const id = externalId.trim();
  const title = name.trim();
  const day = electionDay.trim();
  const division = normalizeOcdId(ocdId);
  const level = classifyOcdLevel(division);
  if (!id || !title || !DAY.test(day) || !level) return null;
  return {
    source,
    externalId: id,
    name: title,
    electionDay: day,
    ocdId: division,
    level,
  };
}

function divisionIds(election: DemocracyWorksElection, fallbackOcdId?: string | null) {
  const nested = [
    ...(election.districtDivisions ?? []),
    ...(election["district-divisions"] ?? []),
  ];
  const ids = nested
    .map((division) => division["ocd-id"] || division.ocdId || division.ocdDivisionId || "")
    .map((id) => id.trim())
    .filter(Boolean);

  const direct = (election.ocdDivisionId || election["ocd-id"] || fallbackOcdId || "").trim();
  if (direct) ids.push(direct);
  return [...new Set(ids)];
}

export function mapGoogleCivicElections(
  payload: unknown,
  fallbackOcdId?: string | null,
): ElectionCycleDraft[] {
  const drafts: ElectionCycleDraft[] = [];
  for (const entry of electionList(payload)) {
    const election = asRecord(entry) as GoogleElection | null;
    if (!election) continue;
    const draft = draftFor(
      "google_civic",
      String(election.id ?? ""),
      String(election.name ?? ""),
      String(election.electionDay ?? ""),
      String(election.ocdDivisionId || fallbackOcdId || ""),
    );
    if (draft) drafts.push(draft);
  }
  return drafts;
}

export function mapDemocracyWorksElections(
  payload: unknown,
  fallbackOcdId?: string | null,
): ElectionCycleDraft[] {
  const drafts: ElectionCycleDraft[] = [];
  for (const entry of electionList(payload)) {
    const election = asRecord(entry) as DemocracyWorksElection | null;
    if (!election) continue;
    const name = String(election.name || election.description || "");
    const day = String(election.date || election.election_date || election.electionDay || "");
    const baseId = String(election.id ?? "").trim();
    const divisions = divisionIds(election, fallbackOcdId);
    if (!baseId || divisions.length === 0) continue;

    for (const ocdId of divisions) {
      const externalId = divisions.length === 1 ? baseId : `${baseId}::${ocdId}`;
      const draft = draftFor("democracy_works", externalId, name, day, ocdId);
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

export function civicDataProvider(): CivicDataSource {
  return process.env.CIVIC_DATA_PROVIDER?.trim() === "democracy_works"
    ? "democracy_works"
    : "google_civic";
}
