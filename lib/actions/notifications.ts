import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin, type PlatformAdmin } from "@/lib/platform/records";
import type { ArenaNotificationType } from "@/types/database.types";

const EXPIRING_WINDOW_MS = 2 * 60 * 60 * 1000;

type Notice = {
  userId: string;
  type: ArenaNotificationType;
  debateId: string;
};

export async function insertArenaNotifications(admin: PlatformAdmin, notices: Notice[]) {
  const rows = notices
    .filter((notice) => notice.userId && notice.debateId)
    .map((notice) => ({
      user_id: notice.userId,
      type: notice.type,
      debate_id: notice.debateId,
    }));
  if (rows.length === 0) return;

  const { error } = await admin.from("notifications").upsert(rows, {
    onConflict: "user_id,type,debate_id",
    ignoreDuplicates: true,
  });
  if (error && !isMissingSchema(error)) {
    console.error("insertArenaNotifications failed.", error.message);
  }
}

export async function notifyChallengeAccepted(debateId: string, candidateAId: string) {
  await insertArenaNotifications(platformAdmin(), [
    { userId: candidateAId, type: "challenge_accepted", debateId },
  ]);
}

export async function notifyDebateConcluded(debateId: string, candidateAId: string, candidateBId: string) {
  await insertArenaNotifications(platformAdmin(), [
    { userId: candidateAId, type: "debate_concluded", debateId },
    { userId: candidateBId, type: "debate_concluded", debateId },
  ]);
}

/** Tell the seat holder once when fewer than two hours remain and no rebuttal is filed. */
export async function notifyExpiringSeats() {
  const admin = platformAdmin();
  const now = Date.now();
  const soon = new Date(now + EXPIRING_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("arena_debates")
    .select("id, candidate_b_id")
    .eq("status", "active")
    .is("stance_b", null)
    .gt("seat_locked_until", new Date(now).toISOString())
    .lte("seat_locked_until", soon);
  if (error) {
    if (isMissingSchema(error)) return;
    throw new Error(error.message);
  }
  const notices = ((data ?? []) as { id: string; candidate_b_id: string | null }[])
    .filter((row) => row.candidate_b_id)
    .map((row) => ({
      userId: row.candidate_b_id as string,
      type: "seat_expiring_soon" as const,
      debateId: row.id,
    }));
  await insertArenaNotifications(admin, notices);
}
