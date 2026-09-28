"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { normalizeOcdId } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";

const UNLOCK_STREAK = 10;

/** Lock campaign targets in one district after the alignment streak clears 10. */
export async function lockCampaignTarget(ocdId: string) {
  const userId = await requireActionUserId();
  if (!userId) throw new Error("Sign in to target a race.");

  const districtId = ocdId.trim();
  if (!districtId) throw new Error("A district is required.");

  const admin = createAdminClient();
  const { data: elections, error: electionError } = await admin
    .from("elections")
    .select("id, ocd_id");

  if (electionError) throw new Error(electionError.message);

  const wanted = normalizeOcdId(districtId);
  const electionIds = ((elections ?? []) as { id: string; ocd_id?: string | null }[])
    .filter((row) => normalizeOcdId(row.ocd_id) === wanted)
    .map((row) => row.id);

  if (electionIds.length === 0) throw new Error("No election is filed for that district.");

  const { data: targets, error: targetError } = await admin
    .from("campaign_targets")
    .select("id, alignment_streak, is_locked")
    .eq("user_id", userId)
    .in("election_id", electionIds);

  if (targetError) throw new Error(targetError.message);

  const rows = (targets ?? []) as {
    id: string;
    alignment_streak: number | null;
    is_locked: boolean | null;
  }[];
  const ready = rows.filter((row) => (row.alignment_streak ?? 0) >= UNLOCK_STREAK);
  if (ready.length === 0) {
    throw new Error("Survive 10 ideological challenges to unlock targeting.");
  }

  const { error: updateError } = await admin
    .from("campaign_targets")
    .update({ is_locked: true })
    .in(
      "id",
      ready.map((row) => row.id),
    );

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/leaderboards");
  revalidatePath("/my-campaign");
  return { locked: true };
}
