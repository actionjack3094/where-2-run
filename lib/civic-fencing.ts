export function isMissingCivicColumn(
  error: { message?: string; code?: string } | null,
) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /ocd_identifiers|tier_2_verified/i.test(message)
  );
}

export function normalizeOcdId(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function extractOcdIdentifiers(
  divisions: Record<string, unknown> | null | undefined,
): string[] {
  if (!divisions || typeof divisions !== "object" || Array.isArray(divisions)) {
    return [];
  }

  const unique = new Set<string>();
  for (const key of Object.keys(divisions)) {
    const id = key.trim();
    if (!id) continue;
    unique.add(id);
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

export function checkLocalEligibility(
  userOcdArray: readonly string[] | null | undefined,
  debateOcdId: string | null | undefined,
): boolean {
  const target = normalizeOcdId(debateOcdId);
  if (!target) return false;
  if (!Array.isArray(userOcdArray) || userOcdArray.length === 0) return false;
  return userOcdArray.some((id) => normalizeOcdId(id) === target);
}

/** OCD division attached to a debate's election. UUID foreign keys are ignored. */
export function readElectionOcdId(
  electionId: string | null | undefined,
  ocdId?: string | null,
) {
  const explicit = (ocdId ?? "").trim();
  if (explicit) return explicit;
  const raw = (electionId ?? "").trim();
  if (raw.toLowerCase().startsWith("ocd-division/")) return raw;
  return null;
}

export function juryDistrictLabel(
  districtName: string | null | undefined,
  electionOcdId: string | null | undefined,
) {
  const name = districtName?.trim();
  if (name) return name;
  return formatOcdDivision(electionOcdId) ?? "this district";
}

export function juryLockedCopy(
  districtName: string | null | undefined,
  electionOcdId: string | null | undefined,
) {
  const district = juryDistrictLabel(districtName, electionOcdId);
  return `Locked: Only verified constituents of ${district} may vote on this appeal.`;
}

const STATE_NAMES: Record<string, string> = {
  al: "Alabama",
  ak: "Alaska",
  az: "Arizona",
  ar: "Arkansas",
  ca: "California",
  co: "Colorado",
  ct: "Connecticut",
  de: "Delaware",
  dc: "District of Columbia",
  fl: "Florida",
  ga: "Georgia",
  hi: "Hawaii",
  id: "Idaho",
  il: "Illinois",
  in: "Indiana",
  ia: "Iowa",
  ks: "Kansas",
  ky: "Kentucky",
  la: "Louisiana",
  me: "Maine",
  md: "Maryland",
  ma: "Massachusetts",
  mi: "Michigan",
  mn: "Minnesota",
  ms: "Mississippi",
  mo: "Missouri",
  mt: "Montana",
  ne: "Nebraska",
  nv: "Nevada",
  nh: "New Hampshire",
  nj: "New Jersey",
  nm: "New Mexico",
  ny: "New York",
  nc: "North Carolina",
  nd: "North Dakota",
  oh: "Ohio",
  ok: "Oklahoma",
  or: "Oregon",
  pa: "Pennsylvania",
  ri: "Rhode Island",
  sc: "South Carolina",
  sd: "South Dakota",
  tn: "Tennessee",
  tx: "Texas",
  ut: "Utah",
  vt: "Vermont",
  va: "Virginia",
  wa: "Washington",
  wv: "West Virginia",
  wi: "Wisconsin",
  wy: "Wyoming",
};

function parseOcdParts(ocdId: string) {
  const path = normalizeOcdId(ocdId).replace(/^ocd-division\//, "");
  const parts: Record<string, string> = {};
  for (const segment of path.split("/").filter(Boolean)) {
    const colon = segment.indexOf(":");
    if (colon <= 0) continue;
    parts[segment.slice(0, colon)] = decodeURIComponent(segment.slice(colon + 1));
  }
  return parts;
}

function titleCaseSlug(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function ocdSpecificity(ocdId: string) {
  const parts = parseOcdParts(ocdId);
  if (parts.cd) return 100;
  if (parts.sldu || parts.sldl) return 90;
  if (parts.ward || parts.council_district) return 85;
  if (parts.place) return 80;
  if (parts.county) return 70;
  if (parts.state) return 40;
  return Object.keys(parts).length;
}

export function pickPrimaryOcdId(ids: readonly string[] | null | undefined) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const ranked = [...ids]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort((left, right) => {
      const delta = ocdSpecificity(right) - ocdSpecificity(left);
      return delta !== 0 ? delta : left.localeCompare(right);
    });
  return ranked[0] ?? null;
}

export function formatOcdDivision(ocdId: string | null | undefined) {
  if (!ocdId?.trim()) return null;
  const parts = parseOcdParts(ocdId);
  const state = parts.state
    ? (STATE_NAMES[parts.state] ?? parts.state.toUpperCase())
    : null;

  if (parts.cd) {
    const numeric = Number(parts.cd);
    const district = Number.isFinite(numeric)
      ? `${ordinal(numeric)} Congressional District`
      : `Congressional District ${parts.cd.toUpperCase()}`;
    return state ? `${state}'s ${district}` : district;
  }

  if (parts.sldu) {
    return [state, `State Senate District ${parts.sldu}`].filter(Boolean).join(" · ");
  }
  if (parts.sldl) {
    return [state, `State House District ${parts.sldl}`].filter(Boolean).join(" · ");
  }
  if (parts.ward) {
    return [state, `Ward ${titleCaseSlug(parts.ward)}`].filter(Boolean).join(" · ");
  }
  if (parts.council_district) {
    return [state, `Council District ${titleCaseSlug(parts.council_district)}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (parts.place) {
    return [titleCaseSlug(parts.place), state].filter(Boolean).join(", ");
  }
  if (parts.county) {
    return [`${titleCaseSlug(parts.county)} County`, state].filter(Boolean).join(", ");
  }
  if (state) return state;
  return ocdId;
}

export function formatVerifiedDistrict(ids: readonly string[] | null | undefined) {
  const primary = pickPrimaryOcdId(ids);
  return formatOcdDivision(primary);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function statesAlign(districtState: string | null | undefined, ocdState: string | undefined) {
  const left = (districtState ?? "").trim().toLowerCase();
  const right = (ocdState ?? "").trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const name = STATE_NAMES[right];
  return Boolean(name && left === name.toLowerCase());
}

function textIncludesState(haystack: string, ocdState: string | undefined) {
  const code = (ocdState ?? "").trim().toLowerCase();
  if (!code) return false;
  if (new RegExp(`\\b${escapeRegExp(code)}\\b`, "i").test(haystack)) return true;
  const name = (STATE_NAMES[code] ?? "").toLowerCase();
  return Boolean(name && haystack.includes(name));
}

function haystackHasToken(haystack: string, raw: string | undefined) {
  const token = (raw ?? "").replace(/[_-]+/g, " ").trim().toLowerCase();
  if (token.length < 3) return false;
  return haystack.includes(token);
}

function haystackHasDistrictNumber(haystack: string, raw: string | undefined) {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return false;
  const numeric = Number(value);
  const tokens = [value];
  if (Number.isFinite(numeric)) tokens.push(ordinal(numeric).toLowerCase());
  return tokens.some((token) =>
    new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(haystack),
  );
}

export type OcdFenceSeat = {
  ocdIds: readonly string[] | null | undefined;
  electionOcdId?: string | null;
  officeName: string;
  districtName?: string | null;
  districtState?: string | null;
};

/**
 * How tightly a seat sits inside a verified OCD fence.
 * 100 is an exact division id. 0 means the seat is outside the fence.
 */
export function ocdFenceSpecificity(input: OcdFenceSeat) {
  const ids = input.ocdIds ?? [];
  if (checkLocalEligibility(ids, input.electionOcdId)) return 100;

  const haystack = `${input.officeName} ${input.districtName ?? ""}`.toLowerCase();
  let best = 0;

  for (const id of ids) {
    if (!id?.trim()) continue;
    const parts = parseOcdParts(id);
    const inState =
      statesAlign(input.districtState, parts.state) || textIncludesState(haystack, parts.state);
    if (!inState) continue;

    if (
      parts.council_district &&
      haystackHasDistrictNumber(haystack, parts.council_district) &&
      (!parts.place || haystackHasToken(haystack, parts.place))
    ) {
      best = Math.max(best, 85);
    }
    if (parts.ward && haystackHasDistrictNumber(haystack, parts.ward)) {
      best = Math.max(best, 85);
    }
    if (parts.cd && haystackHasDistrictNumber(haystack, parts.cd)) {
      best = Math.max(best, 90);
    }
    if (
      parts.sldu &&
      haystackHasDistrictNumber(haystack, parts.sldu) &&
      /senate/.test(haystack)
    ) {
      best = Math.max(best, 90);
    }
    if (
      parts.sldl &&
      haystackHasDistrictNumber(haystack, parts.sldl) &&
      /house|assembly/.test(haystack)
    ) {
      best = Math.max(best, 88);
    }
    if (parts.place && haystackHasToken(haystack, parts.place)) {
      best = Math.max(best, 60);
    }
    if (parts.county && haystackHasToken(haystack, parts.county)) {
      best = Math.max(best, 40);
    }
    best = Math.max(best, 20);
  }

  return best;
}

const JURISDICTION_LABEL_LIMIT = 3;

function stateNameFrom(partsList: Record<string, string>[]) {
  const code = partsList.find((parts) => parts.state)?.state;
  if (!code) return null;
  return STATE_NAMES[code] ?? code.toUpperCase();
}

/**
 * Short office labels for a verified address, most specific chambers first.
 * Capped so the badge reads like "US House, Texas State Senate, Austin City Council".
 */
export function jurisdictionLabels(
  ids: readonly string[] | null | undefined,
  limit = JURISDICTION_LABEL_LIMIT,
) {
  if (!Array.isArray(ids) || ids.length === 0 || limit <= 0) return [];

  const partsList = ids
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => parseOcdParts(id));

  const stateName = stateNameFrom(partsList);
  const council = partsList.find((parts) => parts.council_district);
  const placeSlug = council?.place ?? partsList.find((parts) => parts.place)?.place;
  const placeName = placeSlug ? titleCaseSlug(placeSlug) : null;
  const countySlug = partsList.find((parts) => parts.county)?.county;

  const labels: string[] = [];
  if (partsList.some((parts) => parts.cd)) labels.push("US House");
  if (partsList.some((parts) => parts.sldu)) {
    labels.push(stateName ? `${stateName} State Senate` : "State Senate");
  }
  if (council) {
    labels.push(placeName ? `${placeName} City Council` : "City Council");
  }
  if (partsList.some((parts) => parts.sldl)) {
    labels.push(stateName ? `${stateName} State House` : "State House");
  }
  if (countySlug) labels.push(`${titleCaseSlug(countySlug)} County`);
  if (placeName && !council) labels.push(placeName);
  if (labels.length === 0 && stateName) labels.push(stateName);

  return labels.slice(0, limit);
}
