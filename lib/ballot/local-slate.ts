import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  loadHomeOcdIds,
  loadPrimaries,
  ocdMatches,
  platformAdmin,
} from "@/lib/platform/records";
import { stateByCode } from "@/lib/platform/states";
import { partyLabel } from "@/lib/platform/types";
import type { Primary } from "@/types/database.types";

export type LocalBallotCandidate = {
  id: string;
  name: string;
  primaryId: string;
  office: string;
  party: string;
  state: string;
  district: string | null;
  slug: string;
  grassroots: number;
  institutional: number;
};

export type LocalBallotSlate = {
  signedOut: boolean;
  verified: boolean;
  placeLabel: string | null;
  previewState: string | null;
  candidates: LocalBallotCandidate[];
};

function officeOf(primary: Primary) {
  return primary.office?.trim() || primary.office_name;
}

function placeFromProfile(profile: {
  state_code: string | null;
  congressional_district: string | null;
  county: string | null;
  municipality: string | null;
}) {
  const state = profile.state_code?.trim().toUpperCase() || null;
  const district = profile.congressional_district?.trim() || null;
  const locality = profile.municipality?.trim() || profile.county?.trim() || null;
  const parts = [
    state,
    district ? `District ${district}` : null,
    locality,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export async function loadLocalBallotSlate(
  userId: string | null,
  previewState: string | null,
): Promise<LocalBallotSlate> {
  if (!userId) {
    return { signedOut: true, verified: false, placeLabel: null, previewState: null, candidates: [] };
  }

  const admin = platformAdmin();
  const profileResult = await admin
    .from("profiles")
    .select("state_code, congressional_district, county, municipality, ocd_ids")
    .eq("id", userId)
    .maybeSingle();

  const profile = profileResult.error
    ? null
    : (profileResult.data as {
        state_code: string | null;
        congressional_district: string | null;
        county: string | null;
        municipality: string | null;
        ocd_ids: string[] | null;
      } | null);

  const home = await loadHomeOcdIds(admin, userId);
  const verified = home.length > 0;
  const requested = previewState ? stateByCode(previewState) : null;
  const primaries = await loadPrimaries(admin);
  const local = verified
    ? primaries.filter((primary) => ocdMatches(home, primary.ocd_id))
    : requested
      ? primaries.filter((primary) => primary.state.trim().toUpperCase() === requested.code)
      : [];

  if (local.length === 0) {
    return {
      signedOut: false,
      verified,
      placeLabel: profile ? placeFromProfile(profile) : null,
      previewState: verified ? null : requested?.code ?? null,
      candidates: [],
    };
  }

  const primaryIds = local.map((primary) => primary.id);
  const primaryById = new Map(local.map((primary) => [primary.id, primary]));

  const [candidateResult, standingResult] = await Promise.all([
    admin
      .from("candidates")
      .select("id, display_name, primary_id")
      .in("primary_id", primaryIds),
    admin
      .from("primary_standings")
      .select("user_id, primary_id, pledged_war_chest, institutional_war_chest")
      .in("primary_id", primaryIds),
  ]);

  if (candidateResult.error && !isMissingSchema(candidateResult.error)) {
    throw new Error(candidateResult.error.message);
  }
  if (standingResult.error && !isMissingSchema(standingResult.error)) {
    throw new Error(standingResult.error.message);
  }

  const chests = new Map<string, { grassroots: number; institutional: number }>();
  for (const row of (standingResult.error ? [] : standingResult.data ?? []) as {
    user_id: string;
    primary_id: string;
    pledged_war_chest: number | string | null;
    institutional_war_chest?: number | string | null;
  }[]) {
    chests.set(`${row.user_id}:${row.primary_id}`, {
      grassroots: Number(row.pledged_war_chest ?? 0),
      institutional: Number(row.institutional_war_chest ?? 0),
    });
  }

  const seen = new Set<string>();
  const candidates: LocalBallotCandidate[] = [];
  for (const row of (candidateResult.error ? [] : candidateResult.data ?? []) as {
    id: string;
    display_name: string | null;
    primary_id: string | null;
  }[]) {
    if (!row.primary_id) continue;
    const primary = primaryById.get(row.primary_id);
    if (!primary) continue;
    const key = `${row.id}:${row.primary_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const chest = chests.get(key) ?? { grassroots: 0, institutional: 0 };
    candidates.push({
      id: row.id,
      name: row.display_name?.trim() || "Candidate",
      primaryId: primary.id,
      office: officeOf(primary),
      party: partyLabel(primary.party),
      state: primary.state,
      district: primary.district,
      slug: primary.slug,
      grassroots: chest.grassroots,
      institutional: chest.institutional,
    });
  }

  candidates.sort(
    (left, right) =>
      left.office.localeCompare(right.office) ||
      left.party.localeCompare(right.party) ||
      right.grassroots + right.institutional - (left.grassroots + left.institutional) ||
      left.name.localeCompare(right.name),
  );

  return {
    signedOut: false,
    verified,
    placeLabel: profile ? placeFromProfile(profile) : null,
    previewState: verified ? null : requested?.code ?? null,
    candidates,
  };
}
