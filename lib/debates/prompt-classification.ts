import { normalizeOcdId } from "@/lib/civic-fencing";
import { inferJurisdiction, inferSixAxisFromText } from "@/lib/feed/assign-election";
import { SIX_AXIS_IDS, type SixAxisId } from "@/lib/ideology/six-axis";
import { clamp01 } from "@/lib/ideology/vector";

export const JURISDICTIONAL_LEVELS = ["federal", "state", "local"] as const;

export type JurisdictionalLevel = (typeof JURISDICTIONAL_LEVELS)[number];

export type OcdCatalogEntry = {
  id: string;
  ocdId: string;
  officeName: string;
};

export type PromptClassification = {
  jurisdictional_level: JurisdictionalLevel;
  primary_axis: SixAxisId;
  applicable_ocd_ids: string[];
};

export function isJurisdictionalLevel(value: string): value is JurisdictionalLevel {
  return (JURISDICTIONAL_LEVELS as readonly string[]).includes(value);
}

export function isPrimaryAxis(value: string): value is SixAxisId {
  return (SIX_AXIS_IDS as readonly string[]).includes(value);
}

/** Map an OCD division onto the three jurisdictional buckets used by the classifier. */
export function ocdJurisdictionalLevel(ocdId: string): JurisdictionalLevel | null {
  const id = normalizeOcdId(ocdId);
  if (!id.startsWith("ocd-division/")) return null;
  if (/\/(place|county|council|cdp|ward|precinct|school_district)/.test(id)) return "local";
  if (/\/cd:/.test(id) || /\/senate:/.test(id) || id.endsWith("/country:us")) return "federal";
  if (/\/sld[ul]:/.test(id) || /\/state:[a-z]{2}$/.test(id)) return "state";
  if (/\/state:[a-z]{2}\//.test(id)) return "state";
  return "federal";
}

function mentionsEntry(text: string, entry: OcdCatalogEntry) {
  const haystack = text.toLowerCase();
  const id = entry.ocdId.toLowerCase();
  const office = entry.officeName.toLowerCase();
  if (office.length > 3 && haystack.includes(office)) return true;

  const place = id.match(/place:([a-z0-9_]+)/)?.[1]?.replace(/_/g, " ");
  if (place && place.length > 2 && haystack.includes(place)) return true;

  const state = id.match(/state:([a-z]{2})/)?.[1];
  if (!state) return false;
  if (state === "tx") return /\b(texas|tx)\b/i.test(haystack);
  if (state === "mi") return /\b(michigan|mich)\b/i.test(haystack);
  return new RegExp(`\\b${state}\\b`, "i").test(haystack);
}

/**
 * Keep catalog divisions that sit at `level` and match a requested OCD id,
 * including a parent division that contains the seat.
 */
export function matchCatalogOcdIds(
  requested: readonly string[],
  level: JurisdictionalLevel,
  catalog: readonly OcdCatalogEntry[],
) {
  const wanted = new Set(requested.map((id) => normalizeOcdId(id)).filter(Boolean));
  const matches = catalog.filter((row) => {
    const id = normalizeOcdId(row.ocdId);
    if (!id || ocdJurisdictionalLevel(row.ocdId) !== level) return false;
    if (wanted.has(id)) return true;
    for (const request of wanted) {
      if (id.startsWith(`${request}/`) || request.startsWith(`${id}/`)) return true;
    }
    return false;
  });
  return [...new Set(matches.map((row) => row.ocdId.trim()))].slice(0, 24);
}

export function heuristicPrimaryAxis(text: string): SixAxisId {
  const vector = inferSixAxisFromText(text);
  let bestIndex = 0;
  let best = -1;
  for (let index = 0; index < vector.length; index += 1) {
    const score = vector[index] ?? 0;
    if (score > best) {
      best = score;
      bestIndex = index;
    }
  }
  if (best <= 0.5) return "economy";
  return SIX_AXIS_IDS[bestIndex] ?? "economy";
}

export function axisPositionScore(text: string, axis: SixAxisId) {
  const vector = inferSixAxisFromText(text);
  const index = SIX_AXIS_IDS.indexOf(axis);
  return clamp01(vector[index] ?? 0.5);
}

export function heuristicClassification(
  text: string,
  catalog: readonly OcdCatalogEntry[],
  levelOverride?: JurisdictionalLevel,
): PromptClassification {
  const jurisdictional_level = levelOverride ?? inferJurisdiction(text);
  const primary_axis = heuristicPrimaryAxis(text);
  const leveled = catalog.filter(
    (row) => ocdJurisdictionalLevel(row.ocdId) === jurisdictional_level,
  );
  const named = leveled.filter((row) => mentionsEntry(text, row));
  const pool = named.length > 0 ? named : leveled;
  return {
    jurisdictional_level,
    primary_axis,
    applicable_ocd_ids: [...new Set(pool.map((row) => row.ocdId.trim()))].slice(0, 24),
  };
}
