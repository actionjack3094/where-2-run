import {
  civicDataProvider,
  mapDemocracyWorksElections,
  mapGoogleCivicElections,
  type ElectionCycleDraft,
} from "@/lib/civic/election-cycles";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";

const GOOGLE_ELECTIONS = "https://www.googleapis.com/civicinfo/v2/elections";
const DEMOCRACY_WORKS_ELECTIONS = "https://api.democracy.works/v1/elections";
const ROOT_LIMIT = 25;

type AdminClient = ReturnType<typeof createAdminClient>;

function civicApiKey() {
  return process.env.GOOGLE_CIVIC_API_KEY || process.env.GOOGLE_API_KEY || "";
}

async function readOcdColumn(
  admin: AdminClient,
  table: "districts" | "elections",
) {
  const { data, error } = await admin.from(table).select("ocd_id");
  if (error) {
    if (isMissingSchema(error)) return [] as string[];
    throw new Error(error.message);
  }
  return (data ?? [])
    .map((row) => (typeof row.ocd_id === "string" ? row.ocd_id.trim() : ""))
    .filter(Boolean);
}

export async function electionSyncRoots(admin: AdminClient, requested?: string | null) {
  const explicit = requested?.trim();
  if (explicit) return [explicit];

  const [districts, elections] = await Promise.all([
    readOcdColumn(admin, "districts"),
    readOcdColumn(admin, "elections"),
  ]);
  const roots = new Set<string>(["ocd-division/country:us"]);
  for (const id of [...districts, ...elections]) roots.add(id);
  return [...roots].slice(0, ROOT_LIMIT);
}

async function fetchCycles(ocdId: string): Promise<ElectionCycleDraft[]> {
  const provider = civicDataProvider();
  if (provider === "democracy_works") {
    const apiKey = process.env.DEMOCRACY_WORKS_API_KEY?.trim();
    if (!apiKey) throw new Error("Democracy Works API key is not configured.");
    const url = new URL(DEMOCRACY_WORKS_ELECTIONS);
    url.searchParams.set("district-divisions", ocdId);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String(payload.message)
          : "Democracy Works did not return election cycles.";
      throw new Error(message);
    }
    return mapDemocracyWorksElections(payload, ocdId);
  }

  const apiKey = civicApiKey();
  if (!apiKey) throw new Error("Google Civic API key is not configured.");
  const url = new URL(GOOGLE_ELECTIONS);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("ocdId", ocdId);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error
        ? String(payload.error.message)
        : "Google Civic did not return election cycles.";
    throw new Error(message);
  }
  return mapGoogleCivicElections(payload, ocdId);
}

export async function syncElectionCycles(requestedOcdId?: string | null) {
  const admin = createAdminClient();
  const roots = await electionSyncRoots(admin, requestedOcdId);
  const drafts = new Map<string, ElectionCycleDraft>();

  for (const root of roots) {
    for (const draft of await fetchCycles(root)) {
      drafts.set(`${draft.source}:${draft.externalId}`, draft);
    }
  }

  const { data: seats, error: seatError } = await admin.from("elections").select("id, ocd_id");
  if (seatError && !isMissingSchema(seatError)) throw new Error(seatError.message);
  const electionByOcd = new Map<string, string>();
  for (const seat of seats ?? []) {
    if (seat.ocd_id) electionByOcd.set(normalizeOcdId(seat.ocd_id), seat.id);
  }

  const rows = [...drafts.values()].map((draft) => ({
    source: draft.source,
    external_id: draft.externalId,
    name: draft.name,
    election_day: draft.electionDay,
    ocd_id: draft.ocdId,
    level: draft.level,
    election_id: electionByOcd.get(draft.ocdId) ?? null,
    raw: {
      name: draft.name,
      electionDay: draft.electionDay,
      ocdId: draft.ocdId,
    },
    synced_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return { provider: civicDataProvider(), roots, imported: 0 };
  }

  const { error } = await admin.from("election_cycles").upsert(rows, {
    onConflict: "source,external_id",
  });
  if (error) throw new Error(error.message);

  return { provider: civicDataProvider(), roots, imported: rows.length };
}
