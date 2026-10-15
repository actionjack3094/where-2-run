import { normalizeOcdId } from "@/lib/civic-fencing";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  campaignUnlocks,
  exploringOfficeLabel,
  parseStatutoryFilingFee,
  type CampaignUnlocks,
} from "@/lib/campaign/unlocks";
import { loadPrimaryBySlug, loadProfile, platformAdmin, type PlatformAdmin } from "@/lib/platform/records";
import type { Primary } from "@/types/database.types";

const RAISED_STATUSES = ["pending", "held", "released", "disbursed", "captured"] as const;
const PRIMARY_PICK = "id, party, office_name, state, district, ocd_id, slug";

export type CampaignUnlockLoad = {
  view: CampaignUnlocks;
  primaryId: string | null;
  primaryHref: string | null;
  notice: string | null;
};

type RacePrimary = Pick<Primary, "id" | "party" | "office_name" | "state" | "district" | "ocd_id" | "slug">;

type RaceSeed = {
  officeLabel: string | null;
  filingFee: number | null;
  ocdId: string | null;
  primaryId: string | null;
  primaryHref: string | null;
  electionId: string | null;
  filed: boolean;
  pledgedFallback: number;
};

const EMPTY_SEED: RaceSeed = {
  officeLabel: null,
  filingFee: null,
  ocdId: null,
  primaryId: null,
  primaryHref: null,
  electionId: null,
  filed: false,
  pledgedFallback: 0,
};

export async function loadCampaignUnlocks(
  userId: string,
  primarySlug: string | null,
): Promise<CampaignUnlockLoad> {
  try {
    const admin = platformAdmin();
    const seed = await resolveRace(admin, userId, primarySlug);
    const [inDistrictVotes, pledged] = await Promise.all([
      countVerifiedInDistrictUpvotes(admin, userId, seed.ocdId),
      raisedEscrow(admin, userId, seed.electionId, seed.pledgedFallback),
    ]);
    return {
      view: campaignUnlocks({
        officeLabel: seed.officeLabel,
        inDistrictVotes,
        pledged,
        filingFee: seed.filingFee,
        filed: seed.filed,
      }),
      primaryId: seed.primaryId,
      primaryHref: seed.primaryHref,
      notice: primarySlug && !seed.officeLabel ? "That primary is not on the board." : null,
    };
  } catch (caught) {
    return {
      view: campaignUnlocks({
        officeLabel: null,
        inDistrictVotes: 0,
        pledged: 0,
        filingFee: null,
        filed: false,
      }),
      primaryId: null,
      primaryHref: null,
      notice: caught instanceof Error ? caught.message : "Could not load campaign milestones.",
    };
  }
}

async function resolveRace(admin: PlatformAdmin, userId: string, primarySlug: string | null): Promise<RaceSeed> {
  if (primarySlug) {
    const primary = await loadPrimaryBySlug(admin, primarySlug);
    return primary ? seedFromPrimary(admin, userId, primary) : EMPTY_SEED;
  }

  const targeted = await seedFromLatestTarget(admin, userId);
  if (targeted) return targeted;

  const standing = await admin
    .from("primary_standings")
    .select("primary_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (standing.error) {
    if (isMissingSchema(standing.error)) return EMPTY_SEED;
    throw new Error(standing.error.message);
  }
  const primaryId = standing.data?.primary_id;
  if (!primaryId) return EMPTY_SEED;
  const primary = await loadRacePrimary(admin, primaryId);
  return primary ? seedFromPrimary(admin, userId, primary) : EMPTY_SEED;
}

async function seedFromLatestTarget(admin: PlatformAdmin, userId: string): Promise<RaceSeed | null> {
  const target = await admin
    .from("campaign_targets")
    .select("election_id, status, pledged_escrow, official_candidate_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (target.error) {
    if (isMissingSchema(target.error)) return null;
    throw new Error(target.error.message);
  }
  if (!target.data) return null;

  const election = await admin
    .from("elections")
    .select("id, office_name, ocd_id, filing_requirements")
    .eq("id", target.data.election_id)
    .maybeSingle();
  if (election.error) {
    if (isMissingSchema(election.error)) return null;
    throw new Error(election.error.message);
  }
  if (!election.data) return null;

  const primary = await primaryForOcd(admin, userId, election.data.ocd_id);
  if (primary) return seedFromPrimary(admin, userId, primary);

  const filed = target.data.status === "filed" || Boolean(target.data.official_candidate_id?.trim());
  return {
    officeLabel: exploringOfficeLabel({
      officeName: election.data.office_name,
      state: textField(election.data.filing_requirements, "state"),
      ocdId: election.data.ocd_id,
    }),
    filingFee: parseStatutoryFilingFee(election.data.filing_requirements),
    ocdId: election.data.ocd_id ?? null,
    primaryId: null,
    primaryHref: null,
    electionId: election.data.id,
    filed,
    pledgedFallback: finite(target.data.pledged_escrow),
  };
}

async function seedFromPrimary(admin: PlatformAdmin, userId: string, primary: RacePrimary): Promise<RaceSeed> {
  const [election, standing] = await Promise.all([
    findElection(admin, primary.ocd_id),
    admin
      .from("primary_standings")
      .select("is_nominee, pledged_war_chest")
      .eq("user_id", userId)
      .eq("primary_id", primary.id)
      .maybeSingle(),
  ]);

  let filed = false;
  let warChest = 0;
  let hasStanding = false;
  if (!standing.error && standing.data) {
    hasStanding = true;
    filed = standing.data.is_nominee === true;
    warChest = finite(standing.data.pledged_war_chest);
  } else if (standing.error && !isMissingSchema(standing.error)) {
    throw new Error(standing.error.message);
  }

  let escrow = 0;
  if (election) {
    const target = await admin
      .from("campaign_targets")
      .select("status, pledged_escrow, official_candidate_id")
      .eq("user_id", userId)
      .eq("election_id", election.id)
      .maybeSingle();
    if (!target.error && target.data) {
      escrow = finite(target.data.pledged_escrow);
      if (target.data.status === "filed" || Boolean(target.data.official_candidate_id?.trim())) filed = true;
    } else if (target.error && !isMissingSchema(target.error)) {
      throw new Error(target.error.message);
    }
  }

  return {
    officeLabel: exploringOfficeLabel({
      officeName: primary.office_name,
      state: primary.state,
      district: primary.district,
      ocdId: primary.ocd_id,
    }),
    filingFee: election ? parseStatutoryFilingFee(election.filing_requirements) : null,
    ocdId: primary.ocd_id,
    primaryId: hasStanding ? primary.id : null,
    primaryHref: `/elections/${primary.slug}`,
    electionId: election?.id ?? null,
    filed,
    pledgedFallback: Math.max(escrow, warChest),
  };
}

async function findElection(admin: PlatformAdmin, ocdId: string | null | undefined) {
  const target = ocdId?.trim();
  if (!target) return null;
  const exact = await admin
    .from("elections")
    .select("id, office_name, ocd_id, filing_requirements, created_at")
    .eq("ocd_id", target)
    .order("created_at", { ascending: false });
  if (exact.error) {
    if (isMissingSchema(exact.error)) return null;
    throw new Error(exact.error.message);
  }
  const rows = exact.data ?? [];
  return rows.find((row) => parseStatutoryFilingFee(row.filing_requirements) != null) ?? rows[0] ?? null;
}

async function primaryForOcd(admin: PlatformAdmin, userId: string, ocdId: string | null | undefined) {
  const target = normalizeOcdId(ocdId);
  if (!target) return null;
  const found = await admin.from("primaries").select(PRIMARY_PICK).eq("ocd_id", ocdId ?? "");
  if (found.error) {
    if (isMissingSchema(found.error)) return null;
    throw new Error(found.error.message);
  }
  const rows = ((found.data ?? []) as RacePrimary[]).filter((row) => normalizeOcdId(row.ocd_id) === target);
  if (rows.length === 0) return null;
  const profile = await loadProfile(admin, userId);
  const party = profile?.ideology_x == null ? null : profile.ideology_x < 0 ? "democrat" : "republican";
  return rows.find((row) => row.party === party) ?? rows[0];
}

async function loadRacePrimary(admin: PlatformAdmin, primaryId: string) {
  const found = await admin.from("primaries").select(PRIMARY_PICK).eq("id", primaryId).maybeSingle();
  if (found.error) {
    if (isMissingSchema(found.error)) return null;
    throw new Error(found.error.message);
  }
  return (found.data as RacePrimary | null) ?? null;
}

async function raisedEscrow(
  admin: PlatformAdmin,
  userId: string,
  electionId: string | null,
  fallback: number,
) {
  if (!electionId) return fallback;
  const pledges = await admin
    .from("campaign_pledges")
    .select("amount, status")
    .eq("candidate_id", userId)
    .eq("election_id", electionId)
    .in("status", [...RAISED_STATUSES]);
  if (pledges.error) {
    if (isMissingSchema(pledges.error)) return fallback;
    throw new Error(pledges.error.message);
  }
  const ledger = (pledges.data ?? []).reduce((sum, row) => sum + finite(row.amount), 0);
  return ledger > 0 ? ledger : fallback;
}

export async function countVerifiedInDistrictUpvotes(
  admin: PlatformAdmin,
  candidateId: string,
  ocdId: string | null,
) {
  const target = normalizeOcdId(ocdId);
  if (!target) return 0;

  const [likes, posts] = await Promise.all([
    admin.from("debate_likes").select("user_id").eq("supported_id", candidateId),
    admin.from("soapbox_posts").select("id").eq("author_id", candidateId),
  ]);

  const voterIds: string[] = [];
  if (!likes.error) {
    for (const row of likes.data ?? []) {
      if (row.user_id && row.user_id !== candidateId) voterIds.push(row.user_id);
    }
  } else if (!isMissingSchema(likes.error)) {
    throw new Error(likes.error.message);
  }

  if (!posts.error) {
    const postIds = (posts.data ?? []).map((row) => row.id);
    for (const ids of chunks(postIds, 80)) {
      const votes = await admin.from("soapbox_votes").select("voter_id").in("post_id", ids).eq("direction", 1);
      if (votes.error) {
        if (isMissingSchema(votes.error)) break;
        throw new Error(votes.error.message);
      }
      for (const row of votes.data ?? []) {
        if (row.voter_id && row.voter_id !== candidateId) voterIds.push(row.voter_id);
      }
    }
  } else if (!isMissingSchema(posts.error)) {
    throw new Error(posts.error.message);
  }

  if (voterIds.length === 0) return 0;
  const qualified = await qualifiedVoters(admin, [...new Set(voterIds)], target);
  return voterIds.filter((id) => qualified.has(id)).length;
}

async function qualifiedVoters(admin: PlatformAdmin, voterIds: string[], target: string) {
  const qualified = new Set<string>();
  const needHome = new Set<string>();
  const unresolved = new Set<string>();

  for (const ids of chunks(voterIds, 80)) {
    const profiles = await admin.from("profiles").select("id, is_verified, tier2_status, ocd_ids").in("id", ids);
    if (profiles.error) {
      if (isMissingSchema(profiles.error)) {
        for (const id of ids) unresolved.add(id);
        continue;
      }
      throw new Error(profiles.error.message);
    }
    const seen = new Set<string>();
    for (const row of profiles.data ?? []) {
      seen.add(row.id);
      const verified = row.is_verified === true || row.tier2_status === "verified";
      const home = ocdList(row.ocd_ids);
      if (verified && home.includes(target)) qualified.add(row.id);
      else if (verified && home.length === 0) needHome.add(row.id);
      else if (!verified && home.length === 0) unresolved.add(row.id);
    }
    for (const id of ids) {
      if (!seen.has(id)) unresolved.add(id);
    }
  }

  const lookup = [...new Set([...needHome, ...unresolved])];
  for (const ids of chunks(lookup, 80)) {
    const users = await admin.from("users").select("id, is_verified, home_ocd_ids").in("id", ids);
    if (users.error) {
      if (isMissingSchema(users.error)) break;
      throw new Error(users.error.message);
    }
    for (const row of users.data ?? []) {
      const inDistrict = ocdList(row.home_ocd_ids).includes(target);
      if (!inDistrict) continue;
      if (needHome.has(row.id) || row.is_verified === true) qualified.add(row.id);
    }
  }

  return qualified;
}

function ocdList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => normalizeOcdId(String(id))).filter(Boolean);
}

function textField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function chunks<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}
