import { cache } from "react";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { INBOX_LIMIT, toInboxItem, type InboxItem } from "@/lib/notifications/inbox-shared";
import type { UserNotification } from "@/types/database.types";

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

export const loadInbox = cache(async function loadInbox(userId: string | null) {
  if (!userId) return { items: [] as InboxItem[], unread: 0 };
  const [items, unread] = await Promise.all([
    listInboxForUser(userId),
    countUnreadInboxForUser(userId),
  ]);
  return { items, unread };
});
