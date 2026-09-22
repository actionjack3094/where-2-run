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
