"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin } from "@/lib/platform/records";
import { MAX_PLEDGE_AMOUNT } from "@/lib/pledges";

export type SupportResult = {
  error?: string;
  message?: string;
  pledged?: number;
  enlisted?: boolean;
};

function dollars(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded > MAX_PLEDGE_AMOUNT) return null;
  return rounded;
}

export async function pledgeWarChest(
  candidateId: string,
  primaryId: string,
  amount: number,
): Promise<SupportResult> {
  try {
    if (!isUuid(candidateId) || !isUuid(primaryId)) {
      return { error: "That campaign is not open for pledges." };
    }
    const gift = dollars(amount);
    if (gift == null) {
      return { error: `Enter an amount between $1 and $${MAX_PLEDGE_AMOUNT.toLocaleString("en-US")}.` };
    }
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to pledge." };
    if (userId === candidateId) return { error: "You cannot pledge to your own campaign." };

    const admin = platformAdmin();
    const standing = await admin
      .from("primary_standings")
      .select("id, pledged_war_chest")
      .eq("user_id", candidateId)
      .eq("primary_id", primaryId)
      .maybeSingle();
    if (standing.error) {
      if (isMissingSchema(standing.error)) {
        return { error: "Apply the demo surfaces migration, then pledge again." };
      }
      return { error: standing.error.message };
    }
    const row = standing.data as { id: string; pledged_war_chest: number | string | null } | null;
    if (!row) return { error: "This campaign has not opened a war chest." };

    const next = Math.round((Number(row.pledged_war_chest ?? 0) + gift) * 100) / 100;
    const updated = await admin
      .from("primary_standings")
      .update({ pledged_war_chest: next })
      .eq("id", row.id);
    if (updated.error) return { error: updated.error.message };

    const ledger = await admin.from("platform_pledges").insert({
      donor_id: userId,
      candidate_id: candidateId,
      primary_id: primaryId,
      amount: gift,
      source: "grassroots",
      status: "pledged",
    });
    if (ledger.error && !isMissingSchema(ledger.error)) {
      return { error: ledger.error.message };
    }

    revalidatePath("/ballot");
    revalidatePath("/elections");
    revalidatePath(`/profile/${candidateId}`);
    revalidatePath("/campaign");
    revalidatePath("/campaign-hub");
    return { message: `Pledged $${gift.toLocaleString("en-US")}.`, pledged: next };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not record that pledge." };
  }
}

export async function enlistForCampaign(
  candidateId: string,
  primaryId: string,
): Promise<SupportResult> {
  try {
    if (!isUuid(candidateId) || !isUuid(primaryId)) {
      return { error: "That campaign is not open for volunteers." };
    }
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to volunteer." };
    if (userId === candidateId) return { error: "You cannot volunteer for your own campaign." };

    const admin = platformAdmin();
    const inserted = await admin.from("volunteer_signups").insert({
      campaign_user_id: candidateId,
      volunteer_user_id: userId,
      primary_id: primaryId,
      status: "enlisted",
    });
    if (inserted.error) {
      if (inserted.error.code === "23505") {
        return { message: "You are already enlisted.", enlisted: true };
      }
      if (isMissingSchema(inserted.error)) {
        return { error: "Apply the demo surfaces migration, then enlist again." };
      }
      return { error: inserted.error.message };
    }

    revalidatePath("/ballot");
    revalidatePath(`/profile/${candidateId}`);
    revalidatePath("/dashboard");
    return { message: "You are enlisted.", enlisted: true };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not record that enlistment." };
  }
}
