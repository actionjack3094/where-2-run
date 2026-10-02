"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { formatCandidacyLabel, isUpcomingElectionDate } from "@/lib/campaign/targets";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";

function asOcdIds(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return asOcdIds(JSON.parse(value) as unknown);
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

export type DeclareCampaignTargetResult =
  | { ok: true; targetId: string; alreadyTargeting: boolean }
  | { ok: false; error: string };

/**
 * Start exploring a race: inserts a campaign_targets row with status
 * `exploring` and an alignment streak of 0. Only races on the user's ballot
 * (matched_ocd_ids or home_ocd_ids) can be targeted. Declaring a race the user
 * already targets is a no-op that returns the existing row.
 */
export async function declareCampaignTarget(
  electionId: string,
): Promise<DeclareCampaignTargetResult> {
  try {
    if (!isUuid(electionId)) return { ok: false, error: "Choose a valid race to target." };

    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to target a race." };

    const admin = createAdminClient();

    const { data: election, error: electionError } = await admin
      .from("elections")
      .select("id, ocd_id")
      .eq("id", electionId)
      .maybeSingle();
    if (electionError) throw new Error(electionError.message);
    if (!election) return { ok: false, error: "That race is no longer on the board." };

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("matched_ocd_ids, home_ocd_ids")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const ballot = new Set(
      [...(profile?.matched_ocd_ids ?? []), ...(profile?.home_ocd_ids ?? [])].map((id: string) =>
        normalizeOcdId(id),
      ),
    );
    const ocdId = normalizeOcdId((election as { ocd_id?: string | null }).ocd_id);
    if (!ocdId || !ballot.has(ocdId)) {
      return { ok: false, error: "That race is not on your matched ballot." };
    }

    const { data: existing, error: existingError } = await admin
      .from("campaign_targets")
      .select("id")
      .eq("user_id", userId)
      .eq("election_id", electionId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return { ok: true, targetId: existing.id, alreadyTargeting: true };

    const { data: created, error: insertError } = await admin
      .from("campaign_targets")
      .insert({
        user_id: userId,
        election_id: electionId,
        status: "exploring",
        alignment_streak: 0,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      // 23505: a parallel click inserted it first.
      if (insertError?.code === "23505") {
        const { data: raced } = await admin
          .from("campaign_targets")
          .select("id")
          .eq("user_id", userId)
          .eq("election_id", electionId)
          .maybeSingle();
        if (raced) return { ok: true, targetId: raced.id, alreadyTargeting: true };
      }
      throw new Error(insertError?.message ?? "Could not save this target.");
    }

    revalidatePath("/profile");
    return { ok: true, targetId: created.id, alreadyTargeting: false };
  } catch (caught) {
    console.error("declareCampaignTarget failed.", caught);
    return { ok: false, error: "We couldn't target that race. Please try again." };
  }
}

export type HomeElectionOption = {
  id: string;
  label: string;
  officeName: string;
  electionDate: string | null;
};

export type DeclareCandidacyResult =
  | { ok: true; targetId: string }
  | { ok: false; error: string };

async function eligibleDistrictIds(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const profileQuery = await admin
    .from("users")
    .select("home_ocd_ids, ocd_identifiers")
    .eq("id", userId)
    .maybeSingle();
  if (profileQuery.error) throw new Error(profileQuery.error.message);

  return new Set(
    [...asOcdIds(profileQuery.data?.home_ocd_ids), ...asOcdIds(profileQuery.data?.ocd_identifiers)]
      .map((id) => normalizeOcdId(id))
      .filter(Boolean),
  );
}

/**
 * Upcoming races on the caller's physical ballot (`home_ocd_ids`) or
 * Tier 2 verified divisions.
 */
export async function listHomeElections(): Promise<HomeElectionOption[]> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return [];

    const admin = createAdminClient();
    const eligible = await eligibleDistrictIds(admin, userId);
    if (eligible.size === 0) return [];

    const { data, error } = await admin
      .from("elections")
      .select("id, office_name, ocd_id, election_date")
      .order("election_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as {
      id: string;
      office_name: string;
      ocd_id?: string | null;
      election_date?: string | null;
    }[])
      .filter((row) => {
        const ocdId = normalizeOcdId(row.ocd_id);
        return Boolean(ocdId) && eligible.has(ocdId) && isUpcomingElectionDate(row.election_date);
      })
      .map((row) => ({
        id: row.id,
        officeName: row.office_name,
        electionDate: row.election_date ?? null,
        label: formatCandidacyLabel(row.office_name, row.ocd_id, row.election_date),
      }));
  } catch (caught) {
    console.error("listHomeElections failed.", caught);
    return [];
  }
}

/**
 * Officially declare a run: inserts campaign_targets at alignment_streak 0 so
 * the Campaign Hub can open an escrow vault and streak tracker.
 */
export async function declareCandidacy(electionId: string): Promise<DeclareCandidacyResult> {
  try {
    if (!isUuid(electionId)) return { ok: false, error: "Choose a valid race to run in." };

    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to declare candidacy." };

    const admin = createAdminClient();

    const { data: election, error: electionError } = await admin
      .from("elections")
      .select("id, ocd_id")
      .eq("id", electionId)
      .maybeSingle();
    if (electionError) throw new Error(electionError.message);
    if (!election) return { ok: false, error: "That race is no longer on the board." };

    const eligible = await eligibleDistrictIds(admin, userId);
    const ocdId = normalizeOcdId((election as { ocd_id?: string | null }).ocd_id);
    if (!ocdId || !eligible.has(ocdId)) {
      return { ok: false, error: "You can only declare in a district on your ballot." };
    }

    const { data: existing, error: existingError } = await admin
      .from("campaign_targets")
      .select("id")
      .eq("user_id", userId)
      .eq("election_id", electionId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return { ok: false, error: "You're already running in this race." };
    }

    const { data: created, error: insertError } = await admin
      .from("campaign_targets")
      .insert({
        user_id: userId,
        election_id: electionId,
        status: "exploring",
        alignment_streak: 0,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      if (insertError?.code === "23505") {
        return { ok: false, error: "You're already running in this race." };
      }
      throw new Error(insertError?.message ?? "Could not declare this race.");
    }

    revalidatePath("/profile");
    revalidatePath("/feed");
    return { ok: true, targetId: created.id };
  } catch (caught) {
    console.error("declareCandidacy failed.", caught);
    return { ok: false, error: "We couldn't declare that race. Please try again." };
  }
}

const TARGET_UNLOCK_STREAK = 10;

/**
 * Lock one exploring race once its alignment streak reaches 10.
 * Sets `campaign_targets.is_locked` for the signed-in candidate.
 */
export async function lockCampaignTarget(electionId: string) {
  if (!isUuid(electionId)) throw new Error("Choose a valid race to target.");

  const userId = await requireActionUserId();
  if (!userId) throw new Error("Sign in to target a race.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, alignment_streak, is_locked")
    .eq("user_id", userId)
    .eq("election_id", electionId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const target = data as {
    id: string;
    alignment_streak: number | null;
    is_locked: boolean | null;
  } | null;
  if (!target) throw new Error("Declare this race before locking it.");
  if ((target.alignment_streak ?? 0) < TARGET_UNLOCK_STREAK) {
    throw new Error("Survive 10 ideological challenges to unlock targeting");
  }
  if (target.is_locked) return { locked: true as const };

  const { error: updateError } = await admin
    .from("campaign_targets")
    .update({ is_locked: true })
    .eq("id", target.id)
    .eq("user_id", userId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/profile");
  revalidatePath(`/candidate/${userId}`);
  revalidatePath("/leaderboards");
  return { locked: true as const };
}
