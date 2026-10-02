"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionUserId } from "@/lib/arena/auth";
import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  rankViableRaces,
  type DraftRaceSource,
  type ViableRace,
} from "@/lib/onboarding/draft-races";
import { loadDistrictCentroids } from "@/lib/civic/lookup-address";
import {
  calibrateAxisStance,
  formatPgAxisStance,
  rankByAxisStance,
  type AxisStance,
  type StanceAxisId,
} from "@/lib/ideology/axes";
import { parseVector } from "@/lib/ideology/vector";
import { getServerUser } from "@/lib/db/supabase-server";

type AdminClient = ReturnType<typeof createAdminClient>;

export type DraftRevealPayload = {
  ideologyVector: number[];
  ocdIds: string[];
  races: ViableRace[];
};

type ElectionRow = {
  id: string;
  slug: string;
  office_name: string;
  incumbent_name: string | null;
  district_id: string | null;
  median_voter_vector: unknown;
  ocd_id?: string | null;
  primary_rep_vector?: unknown;
  primary_dem_vector?: unknown;
  general_vector?: unknown;
  pvi_score?: number | null;
};

type DistrictRow = {
  id: string;
  name: string;
  state: string | null;
  pvi_score: number | null;
};

function asOcdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function isMissingOnboardingColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /onboarding_completed/i.test(message)
  );
}

function isMissingOcdColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42703" || error.code === "PGRST204" || /ocd_id/i.test(message);
}

function isMissingFunnelColumn(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /primary_rep_vector|primary_dem_vector|general_vector|pvi_score/i.test(message)
  );
}

const ELECTION_FUNNEL_COLUMNS =
  "id, slug, office_name, incumbent_name, district_id, median_voter_vector, ocd_id, primary_rep_vector, primary_dem_vector, general_vector, pvi_score";

async function loadElections(admin: AdminClient) {
  const funnel = await admin.from("elections").select(ELECTION_FUNNEL_COLUMNS);
  if (!funnel.error) return (funnel.data ?? []) as ElectionRow[];
  if (isMissingRelation(funnel.error)) return [];
  if (!isMissingFunnelColumn(funnel.error)) throw new Error(funnel.error.message);

  const withOcd = await admin
    .from("elections")
    .select("id, slug, office_name, incumbent_name, district_id, median_voter_vector, ocd_id");

  if (!withOcd.error) return (withOcd.data ?? []) as ElectionRow[];
  if (isMissingRelation(withOcd.error)) return [];
  if (!isMissingOcdColumn(withOcd.error)) throw new Error(withOcd.error.message);

  const plain = await admin
    .from("elections")
    .select("id, slug, office_name, incumbent_name, district_id, median_voter_vector");
  if (plain.error) {
    if (isMissingRelation(plain.error)) return [];
    throw new Error(plain.error.message);
  }
  return (plain.data ?? []) as ElectionRow[];
}

async function loadDistricts(admin: AdminClient) {
  const { data, error } = await admin.from("districts").select("id, name, state, pvi_score");
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as DistrictRow[];
}

export async function loadDraftReveal(
  accessToken?: string | null,
): Promise<DraftRevealPayload> {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to read your draft card.");

  const admin = createAdminClient();
  const [userQuery, candidateQuery, elections, districts] = await Promise.all([
    admin
      .from("users")
      .select("ideology_vector, ocd_identifiers")
      .eq("id", userId)
      .maybeSingle(),
    admin.from("candidates").select("ideology_vector").eq("id", userId).maybeSingle(),
    loadElections(admin),
    loadDistricts(admin),
  ]);

  if (userQuery.error) throw new Error(userQuery.error.message);
  if (candidateQuery.error && !isMissingRelation(candidateQuery.error)) {
    throw new Error(candidateQuery.error.message);
  }

  const user = userQuery.data as {
    ideology_vector?: unknown;
    ocd_identifiers?: unknown;
  } | null;
  const candidate = candidateQuery.data as { ideology_vector?: unknown } | null;
  const ocdIds = asOcdArray(user?.ocd_identifiers);
  const ideologyVector = parseVector(candidate?.ideology_vector ?? user?.ideology_vector);
  const districtsById = new Map(districts.map((row) => [row.id, row]));

  const races: DraftRaceSource[] = elections.map((election) => {
    const district = election.district_id ? districtsById.get(election.district_id) : undefined;
    return {
      id: election.id,
      slug: election.slug,
      officeName: election.office_name,
      incumbentName: election.incumbent_name,
      ocdId: election.ocd_id ?? null,
      districtId: election.district_id,
      districtName: district?.name ?? null,
      districtState: district?.state ?? null,
      pviScore: election.pvi_score ?? district?.pvi_score ?? null,
      medianVoterVector: election.median_voter_vector,
      primaryRepVector: election.primary_rep_vector,
      primaryDemVector: election.primary_dem_vector,
      generalVector: election.general_vector ?? election.median_voter_vector,
    };
  });

  return {
    ideologyVector,
    ocdIds,
    races: rankViableRaces({
      ocdIds,
      ideologyVector,
      races,
      limit: 3,
    }),
  };
}

const SEEDED_DISTRICTS = 3;

async function ensurePublicUser(admin: AdminClient, userId: string) {
  const { data, error } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;

  const username = `runner-${userId.replace(/-/g, "").slice(0, 8)}`;
  const { error: insertError } = await admin.from("users").insert({ id: userId, username });
  if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
}

async function seedDistrictAlignment(admin: AdminClient, userId: string, stance: AxisStance) {
  const [centroids, electionsQuery, profileQuery] = await Promise.all([
    loadDistrictCentroids(),
    admin.from("elections").select("id, district_id, ocd_id"),
    admin.from("users").select("target_district_id, home_ocd_ids").eq("id", userId).maybeSingle(),
  ]);

  if (electionsQuery.error && !isMissingRelation(electionsQuery.error)) {
    throw new Error(electionsQuery.error.message);
  }
  if (profileQuery.error) throw new Error(profileQuery.error.message);

  const ranked = rankByAxisStance(
    stance,
    centroids.map((district) => ({
      ...district,
      median_ideology_vector: district.medianIdeologyVector,
    })),
  );
  const closest = ranked.slice(0, SEEDED_DISTRICTS);
  const profile = profileQuery.data as {
    target_district_id?: string | null;
    home_ocd_ids?: string[] | null;
  } | null;

  const districtIds = new Set(closest.map((district) => district.id));
  if (districtIds.size === 0 && profile?.target_district_id) {
    districtIds.add(profile.target_district_id);
  }

  const matchedOcdIds = [
    ...new Set(
      closest
        .map((district) => district.ocdId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (matchedOcdIds.length === 0) {
    const home = (profile?.home_ocd_ids ?? []).filter((id) => id.trim() !== "");
    matchedOcdIds.push(...home);
  }

  const { error: userError } = await admin
    .from("users")
    .update({
      stance_vector: formatPgAxisStance(stance),
      matched_ocd_ids: matchedOcdIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (userError) throw new Error(userError.message);

  const elections = (electionsQuery.data ?? []) as {
    id: string;
    district_id: string | null;
    ocd_id: string | null;
  }[];
  const wantedOcd = new Set(matchedOcdIds.map((id) => id.toLowerCase()));
  const targets = elections.filter((election) => {
    if (election.district_id && districtIds.has(election.district_id)) return true;
    return Boolean(election.ocd_id && wantedOcd.has(election.ocd_id.toLowerCase()));
  });

  if (targets.length === 0) return closest;

  const { error: targetError } = await admin.from("campaign_targets").upsert(
    targets.map((election) => ({
      user_id: userId,
      election_id: election.id,
      status: "exploring",
    })),
    { onConflict: "user_id,election_id", ignoreDuplicates: true },
  );
  if (targetError && !isMissingRelation(targetError)) {
    throw new Error(targetError.message);
  }

  return closest;
}

export async function submitIdeologicalQuiz(
  answers: Partial<Record<StanceAxisId, number>>,
  accessToken?: string | null,
) {
  const userId = (await requireActionUserId(accessToken)) ?? (await getServerUser())?.id ?? null;
  if (!userId) throw new Error("Sign in to file your ideological quiz.");

  const stance = calibrateAxisStance(answers);
  const admin = createAdminClient();
  await ensurePublicUser(admin, userId);

  const now = new Date().toISOString();
  const { error: ideologyError } = await admin.from("user_ideologies").upsert(
    {
      user_id: userId,
      vector_data: stance,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (ideologyError) {
    if (isMissingRelation(ideologyError)) {
      throw new Error("user_ideologies is not on the database yet. Apply the ideology migration.");
    }
    throw new Error(ideologyError.message);
  }

  await seedDistrictAlignment(admin, userId, stance);

  revalidatePath("/onboarding");
  revalidatePath("/leaderboards");
  revalidatePath("/matchmaker");
  revalidatePath("/feed");
  revalidatePath("/profile");
  redirect("/matchmaker");
}

export async function completeOnboarding(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to enter the arena.");

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("candidates")
    .update({
      onboarding_completed: true,
      updated_at: now,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingOnboardingColumn(error)) {
      throw new Error(
        "candidates.onboarding_completed is not on the database yet. Apply the onboarding completion migration.",
      );
    }
    if (isMissingRelation(error)) {
      throw new Error(
        "candidates is not on the database yet. Apply the candidate onboarding migration.",
      );
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Calibrate your ideology vector before entering the arena.");
  }

  revalidatePath("/onboarding");
  revalidatePath("/feed");
  revalidatePath("/profile");
  redirect("/feed");
}
