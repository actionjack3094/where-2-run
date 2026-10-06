"use server";

import { revalidatePath } from "next/cache";
import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin } from "@/lib/platform/records";
import { decidePledge, transparencySpeech, uncapturedCredit } from "@/lib/pledges/backing";

export type InstitutionalResult = { error?: string; message?: string };

function refreshCandidate(candidateId: string) {
  revalidatePath(`/profile/${candidateId}`);
  revalidatePath("/ballot");
  revalidatePath("/soapbox");
  revalidatePath("/campaign");
}

export async function decideInstitutionalPledge(
  pledgeId: string,
  decision: "accepted" | "rejected",
): Promise<InstitutionalResult> {
  try {
    if (!isUuid(pledgeId)) return { error: "That pledge is not on the ledger." };
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to answer a pledge." };
    const admin = platformAdmin();
    const loaded = await admin
      .from("institutional_pledges")
      .select("id, entity_id, candidate_id, primary_id, amount, status")
      .eq("id", pledgeId)
      .maybeSingle();
    if (loaded.error) {
      if (isMissingSchema(loaded.error)) return { error: "Apply the phase 2 migration, then reload." };
      return { error: loaded.error.message };
    }
    const pledge = loaded.data as {
      id: string;
      entity_id: string;
      candidate_id: string;
      primary_id: string | null;
      amount: number | string;
      status: string;
    } | null;
    if (!pledge || pledge.candidate_id !== userId) return { error: "That pledge is not yours to answer." };
    const next = decidePledge({ status: pledge.status, decision });
    if ("error" in next) return { error: next.error };

    const entity = await admin.from("entities").select("name").eq("id", pledge.entity_id).maybeSingle();
    const entityName = (entity.data as { name?: string } | null)?.name ?? "an institution";
    const amount = Number(pledge.amount);

    const updated = await admin
      .from("institutional_pledges")
      .update({ status: next.status })
      .eq("id", pledge.id)
      .eq("status", "pending");
    if (updated.error) return { error: updated.error.message };

    if (next.publish && pledge.primary_id) {
      const standing = await admin
        .from("primary_standings")
        .select("id, institutional_war_chest")
        .eq("user_id", userId)
        .eq("primary_id", pledge.primary_id)
        .maybeSingle();
      if (!standing.error && standing.data) {
        const row = standing.data as { id: string; institutional_war_chest: number | string | null };
        const chest = Math.round((Number(row.institutional_war_chest ?? 0) + amount) * 100) / 100;
        await admin.from("primary_standings").update({ institutional_war_chest: chest }).eq("id", row.id);
      }
      const speech = transparencySpeech(amount, entityName);
      const posted = await admin.from("soapbox_posts").insert({
        author_id: userId,
        content: speech,
        locked: true,
      });
      if (posted.error && isMissingSchema(posted.error)) {
        await admin.from("soapbox_posts").insert({ author_id: userId, content: speech });
      }
    }

    refreshCandidate(userId);
    return {
      message: next.unbought
        ? `${entityName} is on your Unbought list.`
        : transparencySpeech(amount, entityName),
    };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not answer that pledge." };
  }
}

export async function dropOutOfPrimary(primaryId: string): Promise<InstitutionalResult> {
  try {
    if (!isUuid(primaryId)) return { error: "That primary is not on the board." };
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to drop out." };
    const admin = platformAdmin();

    const [platformRows, campaignRows] = await Promise.all([
      admin
        .from("platform_pledges")
        .select("id, donor_id, amount, status")
        .eq("candidate_id", userId)
        .eq("primary_id", primaryId),
      admin
        .from("campaign_pledges")
        .select("id, donor_id, amount, status")
        .eq("candidate_id", userId),
    ]);

    const open = [
      ...((platformRows.error ? [] : platformRows.data ?? []) as {
        id: string;
        donor_id: string;
        amount: number | string;
        status: string;
      }[]),
      ...((campaignRows.error ? [] : campaignRows.data ?? []) as {
        id: string;
        donor_id: string | null;
        amount: number | string;
        status: string;
      }[])
        .filter((row) => row.donor_id)
        .map((row) => ({
          id: row.id,
          donor_id: row.donor_id as string,
          amount: row.amount,
          status: row.status,
        })),
    ];

    const byDonor = new Map<string, { amount: number; status: string }[]>();
    for (const row of open) {
      const list = byDonor.get(row.donor_id) ?? [];
      list.push({ amount: Number(row.amount), status: row.status });
      byDonor.set(row.donor_id, list);
    }

    for (const [donorId, pledges] of byDonor) {
      const credit = uncapturedCredit(pledges);
      if (credit <= 0) continue;
      const existing = await admin.from("civic_credits").select("balance").eq("user_id", donorId).maybeSingle();
      if (existing.error && isMissingSchema(existing.error)) {
        return { error: "Apply the phase 2 migration, then reload." };
      }
      const balance = Math.round((Number((existing.data as { balance?: number | string } | null)?.balance ?? 0) + credit) * 100) / 100;
      if (existing.data) {
        await admin.from("civic_credits").update({ balance, updated_at: new Date().toISOString() }).eq("user_id", donorId);
      } else {
        await admin.from("civic_credits").insert({ user_id: donorId, balance });
      }
    }

    if (!platformRows.error) {
      await admin
        .from("platform_pledges")
        .update({ status: "refunded" })
        .eq("candidate_id", userId)
        .eq("primary_id", primaryId)
        .eq("status", "pledged");
    }
    if (!campaignRows.error) {
      await admin
        .from("campaign_pledges")
        .update({ status: "canceled" })
        .eq("candidate_id", userId)
        .in("status", ["pending", "held"]);
    }

    await admin
      .from("primary_standings")
      .update({ pledged_war_chest: 0, institutional_war_chest: 0 })
      .eq("user_id", userId)
      .eq("primary_id", primaryId);

    refreshCandidate(userId);
    return { message: "Uncaptured pledges were returned as Civic Credit." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not close that campaign." };
  }
}

export async function offerInstitutionalPledge(input: {
  entityId: string;
  candidateId: string;
  primaryId: string;
  amount: number;
}): Promise<InstitutionalResult> {
  try {
    if (!isUuid(input.entityId) || !isUuid(input.candidateId) || !isUuid(input.primaryId)) {
      return { error: "That pledge is missing a campaign." };
    }
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to file a pledge." };
    const admin = platformAdmin();
    const entity = await admin.from("entities").select("id, steward_id").eq("id", input.entityId).maybeSingle();
    if (entity.error) {
      if (isMissingSchema(entity.error)) return { error: "Apply the phase 2 migration, then reload." };
      return { error: entity.error.message };
    }
    const row = entity.data as { id: string; steward_id: string | null } | null;
    if (!row || row.steward_id !== userId) return { error: "Only the entity steward can file that pledge." };
    const inserted = await admin.from("institutional_pledges").insert({
      entity_id: input.entityId,
      candidate_id: input.candidateId,
      primary_id: input.primaryId,
      amount: input.amount,
      status: "pending",
    });
    if (inserted.error) return { error: inserted.error.message };
    refreshCandidate(input.candidateId);
    return { message: "Pledge filed. The candidate can accept or reject it." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not file that pledge." };
  }
}

export async function submitEntityPrompt(input: {
  entityId: string;
  primaryId: string;
  title: string;
  content: string;
}): Promise<InstitutionalResult> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to file a prompt." };
    const admin = platformAdmin();
    const entity = await admin.from("entities").select("id, steward_id, name").eq("id", input.entityId).maybeSingle();
    if (entity.error) {
      if (isMissingSchema(entity.error)) return { error: "Apply the phase 2 migration, then reload." };
      return { error: entity.error.message };
    }
    const row = entity.data as { steward_id: string | null } | null;
    if (!row || row.steward_id !== userId) return { error: "Only the entity steward can file a prompt." };
    const title = input.title.trim();
    const content = input.content.trim();
    if (title.length < 1 || title.length > 100 || content.length < 1 || content.length > 500) {
      return { error: "A prompt needs a title and a body of 500 characters at most." };
    }
    const inserted = await admin.from("community_prompts").insert({
      primary_id: input.primaryId,
      entity_id: input.entityId,
      voter_id: null,
      title,
      content,
    });
    if (inserted.error) {
      if (isMissingSchema(inserted.error)) return { error: "Apply the phase 2 migration, then reload." };
      return { error: inserted.error.message };
    }
    revalidatePath("/elections");
    return { message: "Prompt filed on the Agenda Queue." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not file that prompt." };
  }
}

export async function endorseCandidate(input: {
  entityId: string;
  candidateId: string;
  statement: string;
}): Promise<InstitutionalResult> {
  try {
    const userId = await requireActionUserId();
    if (!userId) return { error: "Sign in to endorse." };
    const admin = platformAdmin();
    const entity = await admin.from("entities").select("steward_id").eq("id", input.entityId).maybeSingle();
    if (entity.error) {
      if (isMissingSchema(entity.error)) return { error: "Apply the phase 2 migration, then reload." };
      return { error: entity.error.message };
    }
    const row = entity.data as { steward_id: string | null } | null;
    if (!row || row.steward_id !== userId) return { error: "Only the entity steward can endorse." };
    const statement = input.statement.trim();
    if (statement.length < 1 || statement.length > 280) {
      return { error: "An endorsement is 280 characters at most." };
    }
    const inserted = await admin.from("entity_endorsements").insert({
      entity_id: input.entityId,
      candidate_id: input.candidateId,
      statement,
    });
    if (inserted.error) return { error: inserted.error.message };
    refreshCandidate(input.candidateId);
    revalidatePath(`/entities/${input.entityId}`);
    return { message: "Endorsement published." };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Could not publish that endorsement." };
  }
}
