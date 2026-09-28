"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";

/** Add dollars to a locked campaign target's escrow balance. */
export async function pledgeFunds(targetId: string, amount: number) {
  const userId = await requireActionUserId();
  if (!userId) throw new Error("Sign in to pledge.");

  const id = targetId.trim();
  if (!id) throw new Error("A campaign target is required.");

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }

  const dollars = Math.round(amount * 100) / 100;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaign_targets")
    .select("id, user_id, pledged_escrow, is_locked")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const target = data as {
    id: string;
    user_id: string;
    pledged_escrow: number | string | null;
    is_locked: boolean | null;
  } | null;

  if (!target) throw new Error("That campaign target is not on the ledger.");
  if (!target.is_locked) throw new Error("This campaign is not open for pledges.");
  if (target.user_id === userId) throw new Error("You cannot pledge to your own campaign.");

  const current = Number(target.pledged_escrow ?? 0);
  const pledgedEscrow = Math.round((current + dollars) * 100) / 100;
  const { error: updateError } = await admin
    .from("campaign_targets")
    .update({ pledged_escrow: pledgedEscrow })
    .eq("id", target.id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/candidate/${target.user_id}`);
  revalidatePath("/leaderboards");
  return { pledgedEscrow };
}
