import { normalizeOcdId } from "@/lib/civic-fencing";
import { normalizeZip } from "@/lib/electability";

export const TX37_OCD_ID = "ocd-division/country:us/state:tx/cd:37";
export const TX10_OCD_ID = "ocd-division/country:us/state:tx/cd:10";
export const MI07_OCD_ID = "ocd-division/country:us/state:mi/cd:7";

/** Known ZIP → congressional OCD-ID. 78704 is Austin / TX-37. */
const ZIP_TO_CONGRESS: Record<string, string> = {
  "78701": TX37_OCD_ID,
  "78702": TX37_OCD_ID,
  "78703": TX37_OCD_ID,
  "78704": TX37_OCD_ID,
  "78705": TX37_OCD_ID,
  "78712": TX37_OCD_ID,
  "78721": TX37_OCD_ID,
  "78722": TX37_OCD_ID,
  "78723": TX37_OCD_ID,
  "78731": TX37_OCD_ID,
  "78741": TX37_OCD_ID,
  "78745": TX37_OCD_ID,
  "78746": TX37_OCD_ID,
  "78751": TX37_OCD_ID,
  "78752": TX37_OCD_ID,
  "78756": TX37_OCD_ID,
  "78757": TX37_OCD_ID,
  "78758": TX37_OCD_ID,
  "78759": TX37_OCD_ID,
  "78602": TX10_OCD_ID,
  "48933": MI07_OCD_ID,
};

function congressionalOcd(state: string, district: string) {
  const st = state.trim().toLowerCase();
  const cd = district.replace(/^0+/, "") || "0";
  if (!st || !/^[a-z]{2}$/.test(st)) return null;
  if (!/^\d+$/.test(cd)) return null;
  return `ocd-division/country:us/state:${st}/cd:${cd}`;
}

/**
 * Resolve a 5-digit ZIP to a congressional district OCD-ID.
 * Prefers the local ZIP table (78704 → TX-37), then Census geocoder.
 */
export function congressionalOcdIdForZip(zip: string | null | undefined) {
  const digits = normalizeZip(zip);
  if (digits.length !== 5) return null;
  const mapped = ZIP_TO_CONGRESS[digits];
  if (mapped) return normalizeOcdId(mapped);
  if (digits.startsWith("787")) return TX37_OCD_ID;
  return null;
}

type CensusDistrict = { STATE?: string; CD118?: string; CD119?: string };

type CensusGeographies = {
  "118th Congressional Districts"?: CensusDistrict[];
  "119th Congressional Districts"?: CensusDistrict[];
};

const STATE_FIPS: Record<string, string> = {
  "48": "tx",
  "26": "mi",
};

export async function lookupCongressionalOcdId(zip: string): Promise<string | null> {
  const local = congressionalOcdIdForZip(zip);
  if (local) return local;

  const digits = normalizeZip(zip);
  if (digits.length !== 5) return null;

  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/address");
  url.searchParams.set("street", "1 Main St");
  url.searchParams.set("zip", digits);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  let payload: {
    result?: { addressMatches?: Array<{ geographies?: CensusGeographies }> };
  } | null = null;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    payload = (await response.json()) as {
      result?: { addressMatches?: Array<{ geographies?: CensusGeographies }> };
    };
  } catch {
    return null;
  }

  const geos = payload?.result?.addressMatches?.[0]?.geographies;
  const row =
    geos?.["119th Congressional Districts"]?.[0] ?? geos?.["118th Congressional Districts"]?.[0];
  if (!row) return null;
  const state = STATE_FIPS[String(row.STATE ?? "")] ?? null;
  const cd = String(row.CD119 ?? row.CD118 ?? "");
  if (!state) return null;
  return congressionalOcd(state, cd);
}
