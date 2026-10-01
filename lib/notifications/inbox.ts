import { revalidatePath } from "next/cache";
import { isMissingSchema } from "@/lib/db/schema-errors";
import type { createAdminClient } from "@/lib/db/supabase-admin";
import {
  campaignRaceLabel,
  pledgeReceivedMessage,
} from "@/lib/notifications/inbox-shared";
import type { UserNotificationType } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

type NotificationDraft = {
  userId: string;
  type: UserNotificationType;
  referenceId?: string | null;
  message: string;
};

function uniqueUserIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export function revalidateInbox() {
  try {
    revalidatePath("/inbox");
    revalidatePath("/notifications");
  } catch {
    // Called from trusted scripts (jury tests, sim) outside a Next request.
  }
}

export async function insertUserNotifications(
  admin: AdminClient,
  drafts: NotificationDraft[],
) {
  const rows = drafts
    .filter((draft) => draft.userId && draft.message.trim())
    .map((draft) => ({
      user_id: draft.userId,
      type: draft.type,
      reference_id: draft.referenceId ?? null,
      message: draft.message.trim(),
    }));
  if (rows.length === 0) return;

  const { error } = await admin.from("user_notifications").insert(rows);
  if (error) {
    if (isMissingSchema(error)) return;
    console.error("insertUserNotifications failed.", error);
    return;
  }
  revalidateInbox();
}

export async function notifyPledgeReceived(
  admin: AdminClient,
  input: {
    candidateId: string;
    electionId: string;
    amount: number;
    pledgeId: string;
  },
) {
  const { data: election } = await admin
    .from("elections")
    .select("office_name, ocd_id")
    .eq("id", input.electionId)
    .maybeSingle();

  await insertUserNotifications(admin, [
    {
      userId: input.candidateId,
      type: "pledge_received",
      referenceId: input.pledgeId,
      message: pledgeReceivedMessage(
        input.amount,
        campaignRaceLabel({
          officeName: election?.office_name,
          ocdId: election?.ocd_id,
        }),
      ),
    },
  ]);
}

export async function notifyAppealFiled(
  admin: AdminClient,
  input: {
    appealId: string;
    candidateIds: Array<string | null | undefined>;
  },
) {
  await insertUserNotifications(
    admin,
    uniqueUserIds(input.candidateIds).map((userId) => ({
      userId,
      type: "appeal_filed" as const,
      referenceId: input.appealId,
      message: "A constituent appealed your recent debate outcome.",
    })),
  );
}

export async function notifyVerdictOverturned(
  admin: AdminClient,
  input: { appealId: string; winnerId: string | null },
) {
  if (!input.winnerId) return;
  await insertUserNotifications(admin, [
    {
      userId: input.winnerId,
      type: "verdict_overturned",
      referenceId: input.appealId,
      message: "A jury overturned your debate win. Elo and escrow have been rolled back.",
    },
  ]);
}

export async function notifyCoalitionInvite(
  admin: AdminClient,
  input: { candidateId: string; coalitionId: string; coalitionName: string },
) {
  const name = input.coalitionName.trim() || "a coalition";
  await insertUserNotifications(admin, [
    {
      userId: input.candidateId,
      type: "coalition_invite",
      referenceId: input.coalitionId,
      message: `You've been invited to join ${name}.`,
    },
  ]);
}

export async function notifyChallengeReceived(
  admin: AdminClient,
  input: { targetUserId: string; debateId: string; message: string },
) {
  await insertUserNotifications(admin, [
    {
      userId: input.targetUserId,
      type: "challenge_received",
      referenceId: input.debateId,
      message: input.message,
    },
  ]);
}
