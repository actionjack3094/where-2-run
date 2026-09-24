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
import { parseVector } from "@/lib/ideology/vector";

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
  const [userQuery, candidateQuery, verificationQuery, elections, districts] = await Promise.all([
    admin
      .from("users")
      .select("ideology_vector, ocd_identifiers")
      .eq("id", userId)
      .maybeSingle(),
    admin.from("candidates").select("ideology_vector").eq("id", userId).maybeSingle(),
    admin.from("tier2_verifications").select("ocd_ids").eq("user_id", userId).maybeSingle(),
    loadElections(admin),
    loadDistricts(admin),
  ]);

  if (userQuery.error) throw new Error(userQuery.error.message);
  if (candidateQuery.error && !isMissingRelation(candidateQuery.error)) {
    throw new Error(candidateQuery.error.message);
  }
  if (verificationQuery.error && !isMissingRelation(verificationQuery.error)) {
    throw new Error(verificationQuery.error.message);
  }

  const user = userQuery.data as {
    ideology_vector?: unknown;
    ocd_identifiers?: unknown;
  } | null;
  const candidate = candidateQuery.data as { ideology_vector?: unknown } | null;
  const verifiedOcd = asOcdArray(
    (verificationQuery.data as { ocd_ids?: unknown } | null)?.ocd_ids,
  );
  const ocdIds = verifiedOcd.length > 0 ? verifiedOcd : asOcdArray(user?.ocd_identifiers);
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
