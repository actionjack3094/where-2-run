"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";

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
