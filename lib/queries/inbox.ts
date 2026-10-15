import { cache } from "react";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { INBOX_LIMIT, toInboxItem, type InboxItem } from "@/lib/notifications/inbox-shared";
import type { ArenaNotification, UserNotification } from "@/types/database.types";

function arenaMessage(type: string) {
  if (type === "challenge_accepted") {
    return "Your seat is locked. The challenger has 48 hours to file a rebuttal.";
  }
  if (type === "seat_expiring_soon") {
    return "Your locked seat expires in under two hours. File the rebuttal.";
  }
  if (type === "debate_concluded") {
    return "The exchange is closed. The result is on your profile.";
  }
  return "A debate update is waiting.";
}

function arenaInboxItem(row: ArenaNotification): InboxItem {
  return {
    id: row.id,
    type: row.type,
    referenceId: row.debate_id,
    message: arenaMessage(row.type),
    readAt: row.is_read ? row.created_at : null,
    createdAt: row.created_at,
    href: "/debates",
  };
}

async function listArenaNotices(userId: string): Promise<InboxItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id, user_id, type, debate_id, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);
  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as ArenaNotification[]).map(arenaInboxItem);
}

export async function listInboxForUser(userId: string): Promise<InboxItem[]> {
  if (!isUuid(userId)) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_notifications")
    .select("id, user_id, type, reference_id, message, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);

  if (error) {
    if (isMissingSchema(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as UserNotification[]).map(toInboxItem);
}

export async function listMergedInbox(userId: string): Promise<InboxItem[]> {
  const [legacy, arena] = await Promise.all([
    listInboxForUser(userId),
    listArenaNotices(userId),
  ]);
  return [...legacy, ...arena]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, INBOX_LIMIT);
}

export async function countUnreadInboxForUser(userId: string): Promise<number> {
  if (!isUuid(userId)) return 0;

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function countUnreadArena(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) {
    if (isMissingSchema(error)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export const loadInbox = cache(async function loadInbox(userId: string | null) {
  if (!userId) return { items: [] as InboxItem[], unread: 0 };
  const [items, legacyUnread, arenaUnread] = await Promise.all([
    listMergedInbox(userId),
    countUnreadInboxForUser(userId),
    countUnreadArena(userId),
  ]);
  return { items, unread: legacyUnread + arenaUnread };
});
