import { formatOcdDivision, normalizeOcdId } from "@/lib/civic-fencing";

export type CensusGeoRow = Record<string, string | number | null | undefined>;

export type VoterDistrictFields = {
  stateCode: string | null;
  congressionalDistrict: string | null;
  stateLegDistrictUpper: string | null;
  stateLegDistrictLower: string | null;
  county: string | null;
  municipality: string | null;
  ocdIds: string[];
  congressional: string | null;
  stateHouse: string | null;
  cityCouncil: string | null;
};

const FIPS_TO_STATE: Record<string, string> = {
  "01": "al",
  "02": "ak",
  "04": "az",
  "05": "ar",
  "06": "ca",
  "08": "co",
  "09": "ct",
  "10": "de",
  "11": "dc",
  "12": "fl",
  "13": "ga",
  "15": "hi",
  "16": "id",
  "17": "il",
  "18": "in",
  "19": "ia",
  "20": "ks",
  "21": "ky",
  "22": "la",
  "23": "me",
  "24": "md",
  "25": "ma",
  "26": "mi",
  "27": "mn",
  "28": "ms",
  "29": "mo",
  "30": "mt",
  "31": "ne",
  "32": "nv",
  "33": "nh",
  "34": "nj",
  "35": "nm",
  "36": "ny",
  "37": "nc",
  "38": "nd",
  "39": "oh",
  "40": "ok",
  "41": "or",
  "42": "pa",
  "44": "ri",
  "45": "sc",
  "46": "sd",
  "47": "tn",
  "48": "tx",
  "49": "ut",
  "50": "vt",
  "51": "va",
  "53": "wa",
  "54": "wv",
  "55": "wi",
  "56": "wy",
};

function segment(ocdId: string, key: string) {
  const match = normalizeOcdId(ocdId).match(new RegExp(`(?:^|/)${key}:([^/]+)`));
  return match?.[1] ?? null;
}

function titleSlug(slug: string | null) {
  if (!slug) return null;
  const words = slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || null;
}

function firstSegment(ids: string[], key: string) {
  for (const id of ids) {
    const value = segment(id, key);
    if (value) return value;
  }
  return null;
}

function firstId(ids: string[], key: string) {
  return ids.find((id) => segment(id, key)) ?? null;
}

export function districtsFromOcdIds(rawIds: string[]): VoterDistrictFields {
  const ocdIds = [
    ...new Set(
      rawIds
        .map((id) => normalizeOcdId(id))
        .filter((id) => id.startsWith("ocd-division/country:us/state:")),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const state = firstSegment(ocdIds, "state");
  const cd = firstSegment(ocdIds, "cd");
  const upper = firstSegment(ocdIds, "sldu");
  const lower = firstSegment(ocdIds, "sldl");
  const county = titleSlug(firstSegment(ocdIds, "county"));
  const municipality = titleSlug(firstSegment(ocdIds, "place"));
  const councilId = firstId(ocdIds, "council_district") ?? firstId(ocdIds, "ward");
  const congressionalId = firstId(ocdIds, "cd");
  const houseId = firstId(ocdIds, "sldl");

  return {
    stateCode: state ? state.toUpperCase() : null,
    congressionalDistrict: cd,
    stateLegDistrictUpper: upper,
    stateLegDistrictLower: lower,
    county,
    municipality,
    ocdIds,
    congressional: congressionalId ? formatOcdDivision(congressionalId) : null,
    stateHouse: houseId ? formatOcdDivision(houseId) : null,
    cityCouncil: councilId
      ? formatOcdDivision(councilId)
      : municipality
        ? `${municipality} · citywide`
        : null,
  };
}

function geoRow(geographies: Record<string, CensusGeoRow[] | undefined>, pattern: RegExp) {
  for (const [key, rows] of Object.entries(geographies)) {
    if (pattern.test(key) && rows?.[0]) return rows[0];
  }
  return null;
}

function cell(row: CensusGeoRow | null, ...keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function districtNumber(raw: string) {
  const digits = raw.match(/\d+/)?.[0];
  if (!digits) return null;
  const number = String(Number(digits));
  if (!Number.isFinite(Number(digits))) return null;
  return number === "0" ? "1" : number;
}

function ocdSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’.]+/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Turn a Census geocoder geography block into Open Civic Data division ids. */
export function districtsFromCensusGeographies(
  geographies: Record<string, CensusGeoRow[] | undefined> | null | undefined,
): VoterDistrictFields {
  const geos = geographies ?? {};
  const stateRow = geoRow(geos, /^states$/i);
  const abbr =
    cell(stateRow, "STUSAB").toLowerCase() ||
    FIPS_TO_STATE[cell(stateRow, "STATE").padStart(2, "0")] ||
    "";
  if (!/^[a-z]{2}$/.test(abbr)) return districtsFromOcdIds([]);

  const root = `ocd-division/country:us/state:${abbr}`;
  const ids = [root];

  const congress = geoRow(geos, /congressional districts/i);
  const cd = districtNumber(
    cell(congress, "BASENAME", "CD119", "CD118", "CD117", "CD", "GEOID"),
  );
  if (cd) ids.push(`${root}/cd:${cd}`);

  const upper = geoRow(geos, /legislative districts.*upper|upper chamber/i);
  const sldu = districtNumber(cell(upper, "BASENAME", "SLDU", "GEOID"));
  if (sldu) ids.push(`${root}/sldu:${sldu}`);

  const lower = geoRow(geos, /legislative districts.*lower|lower chamber/i);
  const sldl = districtNumber(cell(lower, "BASENAME", "SLDL", "GEOID"));
  if (sldl) ids.push(`${root}/sldl:${sldl}`);

  const countyName = cell(geoRow(geos, /^counties$/i), "BASENAME", "NAME");
  const countySlug = ocdSlug(countyName.replace(/\s+county$/i, ""));
  if (countySlug) ids.push(`${root}/county:${countySlug}`);

  const placeName = cell(geoRow(geos, /incorporated places/i), "BASENAME", "NAME");
  const placeSlug = ocdSlug(placeName.replace(/\s+city$/i, ""));
  if (placeSlug) ids.push(`${root}/place:${placeSlug}`);

  return districtsFromOcdIds(ids);
}
