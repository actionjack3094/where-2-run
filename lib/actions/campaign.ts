"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  canPublishPlatform,
  canRecruitVolunteers,
  normalizeKeyPolicies,
  normalizeManifesto,
} from "@/lib/platform/campaign";
import { formatOcdDivision } from "@/lib/civic-fencing";
import { volunteersToCsv, type VolunteerExportRow } from "@/lib/platform/volunteers";
import { partyLabel } from "@/lib/platform/types";
import {
  displayName,
  loadProfile,
  loadStanding,
  platformAdmin,
  rankedField,
  type PlatformAdmin,
} from "@/lib/platform/records";
import { tierForPrimaryStanding, type StandingRow } from "@/lib/actions/tiers";
import type { CandidateTierName } from "@/lib/platform/scoring";
import type { Primary } from "@/types/database.types";

export type CampaignActionResult = {
  error?: string;
  message?: string;
};

export type CampaignRace = {
  primaryId: string;
  label: string;
  tier: CandidateTierName;
  manifesto: string;
  keyPolicies: string[];
};

export type PublishedPlatform = {
  primaryId: string;
  label: string;
  tier: CandidateTierName;
  manifesto: string;
  keyPolicies: string[];
};

async function tierForUserPrimary(admin: PlatformAdmin, userId: string, primaryId: string) {
  const profile = await loadProfile(admin, userId);
  const standing = await loadStanding(admin, userId, primaryId);
  if (!profile || !standing || standing.debates_count <= 0) {
    return { profile, tier: "pundit" as CandidateTierName };
  }
  const field = await rankedField(admin, primaryId);
  const row: StandingRow = {
    user_id: standing.user_id,
    civic_standing: standing.civic_standing,
    ties: standing.ties,
    debates_count: standing.debates_count,
    debates_logged: standing.debates_logged,
    policy_consistency: standing.policy_consistency,
  };
  return { profile, tier: tierForPrimaryStanding(row, profile, field) };
}

function raceLabel(primary: Primary | undefined) {
  if (!primary) return "Primary";
  const seat = primary.district ? `${primary.state}-${primary.district}` : primary.state;
  const party = primary.party === "republican" ? "republican" : "democrat";
  return `${partyLabel(party)} · ${seat} · ${primary.office_name}`;
}

export async function upsertCampaignPlatform(
  primaryId: string,
  manifesto: string,
  keyPolicies: string[],
): Promise<CampaignActionResult> {
  try {
    if (!isUuid(primaryId)) return { error: "That primary is not on the board." };
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to publish a campaign platform." };

    let text: string;
    let policies: string[];
    try {
      text = normalizeManifesto(manifesto);
      policies = normalizeKeyPolicies(keyPolicies);
    } catch (caught) {
      return { error: caught instanceof Error ? caught.message : "Check the manifesto and pillars." };
    }

    const admin = platformAdmin();
    const { profile, tier } = await tierForUserPrimary(admin, userId, primaryId);
    if (!profile?.is_verified && profile?.tier2_status !== "verified") {
      return { error: "Stripe identity verification is required before a platform can be published." };
    }
    if (!canPublishPlatform(tier)) {
      return { error: "Campaign publishing opens in the top 50% Civic Standing of this primary." };
    }

    const now = new Date().toISOString();
    const { error } = await admin.from("candidate_platforms").upsert(
      {
        user_id: userId,
        primary_id: primaryId,
        manifesto: text,
        key_policies: policies,
        updated_at: now,
      },
      { onConflict: "user_id,primary_id" },
    );
    if (error) {
      if (isMissingSchema(error)) {
        return { error: "Apply the campaign platform migration, then publish again." };
      }
      return { error: error.message };
    }

    revalidatePath(`/profile/${userId}`);
    revalidatePath("/dashboard");
    revalidatePath("/profile/settings/platform");
    return { message: "Your campaign platform is live." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not save that platform." };
  }
}

export async function registerAsVolunteer(
  campaignUserId: string,
  primaryId: string,
): Promise<CampaignActionResult> {
  try {
    if (!isUuid(campaignUserId) || !isUuid(primaryId)) {
      return { error: "That campaign is not open for volunteers." };
    }
    const volunteerId = await requireActionUserId();
    if (!volunteerId) return { error: "Sign in to volunteer." };
    if (volunteerId === campaignUserId) {
      return { error: "You cannot volunteer for your own campaign." };
    }

    const admin = platformAdmin();
    const { tier } = await tierForUserPrimary(admin, campaignUserId, primaryId);
    if (!canRecruitVolunteers(tier)) {
      return { error: "Volunteer signup opens when this candidate is a Frontrunner in this primary." };
    }

    const { error } = await admin.from("volunteer_signups").insert({
      campaign_user_id: campaignUserId,
      volunteer_user_id: volunteerId,
      primary_id: primaryId,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") return { message: "Your volunteer request is already pending." };
      if (isMissingSchema(error)) {
        return { error: "Apply the campaign platform migration, then try again." };
      }
      return { error: error.message };
    }

    revalidatePath(`/profile/${campaignUserId}`);
    return { message: "Your volunteer request is pending." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not file that volunteer request." };
  }
}

export async function loadCampaignRaces(userId: string): Promise<CampaignRace[]> {
  const admin = platformAdmin();
  const { data, error } = await admin
    .from("primary_standings")
    .select("primary_id, civic_standing, debates_count, debates_logged, policy_consistency, ties")
    .eq("user_id", userId)
    .gt("debates_count", 0);
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as {
    primary_id: string;
    civic_standing: number;
    debates_count: number;
    debates_logged: number;
    policy_consistency: number;
    ties: number;
  }[];
  const races: CampaignRace[] = [];
  for (const row of rows) {
    const { tier } = await tierForUserPrimary(admin, userId, row.primary_id);
    if (!canPublishPlatform(tier)) continue;
    races.push({
      primaryId: row.primary_id,
      label: row.primary_id,
      tier,
      manifesto: "",
      keyPolicies: [],
    });
  }
  if (races.length === 0) return [];

  const primaryResult = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .in(
      "id",
      races.map((race) => race.primaryId),
    );
  if (primaryResult.error) throw new Error(primaryResult.error.message);
  const primaries = new Map(
    ((primaryResult.data ?? []) as Primary[]).map((primary) => [primary.id, primary]),
  );

  const platformResult = await admin
    .from("candidate_platforms")
    .select("primary_id, manifesto, key_policies")
    .eq("user_id", userId)
    .in(
      "primary_id",
      races.map((race) => race.primaryId),
    );
  const saved = new Map<string, { manifesto: string; key_policies: unknown }>();
  if (!platformResult.error) {
    for (const row of (platformResult.data ?? []) as {
      primary_id: string;
      manifesto: string;
      key_policies: unknown;
    }[]) {
      saved.set(row.primary_id, row);
    }
  } else if (!isMissingSchema(platformResult.error)) {
    throw new Error(platformResult.error.message);
  }

  return races
    .map((race) => {
      const existing = saved.get(race.primaryId);
      const policies = Array.isArray(existing?.key_policies)
        ? existing.key_policies.filter((item): item is string => typeof item === "string")
        : [];
      return {
        ...race,
        label: raceLabel(primaries.get(race.primaryId)),
        manifesto: existing?.manifesto ?? "",
        keyPolicies: policies,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadPublishedPlatforms(userId: string): Promise<PublishedPlatform[]> {
  const admin = platformAdmin();
  const { data, error } = await admin
    .from("candidate_platforms")
    .select("primary_id, manifesto, key_policies, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as {
    primary_id: string;
    manifesto: string;
    key_policies: unknown;
  }[];
  if (rows.length === 0) return [];

  const primaryResult = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .in(
      "id",
      rows.map((row) => row.primary_id),
    );
  if (primaryResult.error) throw new Error(primaryResult.error.message);
  const primaries = new Map(
    ((primaryResult.data ?? []) as Primary[]).map((primary) => [primary.id, primary]),
  );

  const platforms: PublishedPlatform[] = [];
  for (const row of rows) {
    const { tier } = await tierForUserPrimary(admin, userId, row.primary_id);
    const policies = Array.isArray(row.key_policies)
      ? row.key_policies.filter((item): item is string => typeof item === "string")
      : [];
    platforms.push({
      primaryId: row.primary_id,
      label: raceLabel(primaries.get(row.primary_id)),
      tier,
      manifesto: row.manifesto,
      keyPolicies: policies,
    });
  }
  return platforms;
}

export async function loadVolunteerPrimaryIds(viewerId: string, campaignUserId: string) {
  const admin = platformAdmin();
  const { data, error } = await admin
    .from("volunteer_signups")
    .select("primary_id")
    .eq("volunteer_user_id", viewerId)
    .eq("campaign_user_id", campaignUserId);
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as { primary_id: string }[]).map((row) => row.primary_id);
}

export type VolunteerSignupRow = {
  id: string;
  primaryId: string;
  primaryLabel: string;
  name: string;
  status: string;
  createdAt: string;
  districts: string;
};

const VOLUNTEER_STATUS = ["pending", "accepted", "declined", "contacted"] as const;
export type VolunteerUpdateStatus = (typeof VOLUNTEER_STATUS)[number];

async function frontrunnerPrimaryIds(admin: PlatformAdmin, userId: string) {
  const { data, error } = await admin
    .from("primary_standings")
    .select("primary_id")
    .eq("user_id", userId)
    .gt("debates_count", 0);
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  const ids: string[] = [];
  for (const row of (data ?? []) as { primary_id: string }[]) {
    const { tier } = await tierForUserPrimary(admin, userId, row.primary_id);
    if (canRecruitVolunteers(tier)) ids.push(row.primary_id);
  }
  return ids;
}

function volunteerName(profile: {
  legal_name: string | null;
  display_name: string | null;
  full_name: string | null;
} | undefined) {
  if (!profile) return "Volunteer";
  if (profile.legal_name?.trim()) return profile.legal_name.trim();
  return displayName(profile);
}

function districtList(ocdIds: string[] | null | undefined) {
  const labels = (ocdIds ?? [])
    .map((id) => formatOcdDivision(id))
    .filter((label): label is string => Boolean(label));
  return labels.join("; ");
}

async function signupRows(admin: PlatformAdmin, userId: string, primaryIds: string[]) {
  if (primaryIds.length === 0) return [];
  const { data, error } = await admin
    .from("volunteer_signups")
    .select("id, volunteer_user_id, primary_id, status, created_at")
    .eq("campaign_user_id", userId)
    .in("primary_id", primaryIds)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  const signups = (data ?? []) as {
    id: string;
    volunteer_user_id: string;
    primary_id: string;
    status: string;
    created_at: string;
  }[];
  if (signups.length === 0) return [];

  const volunteerIds = [...new Set(signups.map((row) => row.volunteer_user_id))];
  const profileResult = await admin
    .from("profiles")
    .select("id, legal_name, display_name, full_name, ocd_ids")
    .in("id", volunteerIds);
  if (profileResult.error && !isMissingSchema(profileResult.error)) {
    throw new Error(profileResult.error.message);
  }
  const profiles = new Map(
    ((profileResult.data ?? []) as {
      id: string;
      legal_name: string | null;
      display_name: string | null;
      full_name: string | null;
      ocd_ids?: string[] | null;
    }[]).map((row) => [row.id, row]),
  );

  const primaryResult = await admin
    .from("primaries")
    .select("id, party, office_name, state, district, ocd_id, baseline_x, baseline_y, slug, general_slug, created_at")
    .in("id", primaryIds);
  if (primaryResult.error) throw new Error(primaryResult.error.message);
  const primaries = new Map(((primaryResult.data ?? []) as Primary[]).map((row) => [row.id, row]));

  return signups.map((row) => {
    const profile = profiles.get(row.volunteer_user_id);
    return {
      id: row.id,
      primaryId: row.primary_id,
      primaryLabel: raceLabel(primaries.get(row.primary_id)),
      name: volunteerName(profile),
      status: row.status,
      createdAt: row.created_at,
      districts: districtList(profile?.ocd_ids),
    } satisfies VolunteerSignupRow;
  });
}

/** Signups for one primary. The caller must be that campaign's Frontrunner. */
export async function getVolunteerSignups(
  primaryId: string,
): Promise<{ signups: VolunteerSignupRow[]; error?: string }> {
  try {
    if (!isUuid(primaryId)) return { signups: [], error: "That primary is not on the board." };
    const userId = await requireActionUserId();
    if (!userId) return { signups: [], error: "Sign in to manage volunteers." };

    const admin = platformAdmin();
    const allowed = await frontrunnerPrimaryIds(admin, userId);
    if (!allowed.includes(primaryId)) {
      return { signups: [], error: "Volunteer management opens when you are a Frontrunner in this primary." };
    }
    const signups = await signupRows(admin, userId, [primaryId]);
    return { signups };
  } catch (caught) {
    return {
      signups: [],
      error: caught instanceof Error ? caught.message : "Could not load volunteers.",
    };
  }
}

export async function updateVolunteerStatus(
  signupId: string,
  status: VolunteerUpdateStatus,
): Promise<CampaignActionResult> {
  try {
    if (!isUuid(signupId)) return { error: "That signup is not on the roster." };
    if (!VOLUNTEER_STATUS.includes(status)) {
      return { error: "Choose pending, accepted, declined, or contacted." };
    }
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to update a volunteer." };

    const admin = platformAdmin();
    const { data, error } = await admin
      .from("volunteer_signups")
      .select("id, campaign_user_id, primary_id")
      .eq("id", signupId)
      .maybeSingle();
    if (error) {
      if (isMissingSchema(error)) return { error: "Apply the volunteer status migration, then try again." };
      return { error: error.message };
    }
    const signup = data as { id: string; campaign_user_id: string; primary_id: string } | null;
    if (!signup || signup.campaign_user_id !== userId) {
      return { error: "That signup belongs to another campaign." };
    }
    const { tier } = await tierForUserPrimary(admin, userId, signup.primary_id);
    if (!canRecruitVolunteers(tier)) {
      return { error: "Volunteer management opens when you are a Frontrunner in this primary." };
    }

    const { error: updateError } = await admin
      .from("volunteer_signups")
      .update({ status })
      .eq("id", signup.id)
      .eq("campaign_user_id", userId);
    if (updateError) return { error: updateError.message };

    revalidatePath("/dashboard");
    revalidatePath("/profile/settings/volunteers");
    return { message: "Volunteer status updated." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not update that volunteer." };
  }
}

/** CSV of this Frontrunner's signups. The street address stays encrypted. */
export async function volunteerCsv(): Promise<{ error?: string; csv?: string }> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to export volunteers." };
    const admin = platformAdmin();
    const primaryIds = await frontrunnerPrimaryIds(admin, userId);
    if (primaryIds.length === 0) {
      return { error: "Volunteer export opens when you are a Frontrunner." };
    }
    const signups = await signupRows(admin, userId, primaryIds);
    const rows: VolunteerExportRow[] = signups.map((row) => ({
      name: row.name,
      status: row.status,
      date: row.createdAt.slice(0, 10),
      districts: row.districts,
    }));
    return { csv: volunteersToCsv(rows) };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not export volunteers." };
  }
}
