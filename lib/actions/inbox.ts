"use server";

import { requireActionUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { revalidateInbox } from "@/lib/notifications/inbox";
import { loadInbox } from "@/lib/queries/inbox";

export async function getInbox() {
  const userId = await requireActionUserId();
  if (!userId) return { items: [], unread: 0 };
  return loadInbox(userId);
}

export async function countUnreadInbox() {
  const inbox = await getInbox();
  return inbox.unread;
}

/**
 * Stamp `read_at` on the signed-in user's notifications. Unknown ids are ignored.
 */
export async function markAsRead(
  notificationIds: string[],
): Promise<{ ok: true; marked: number } | { ok: false; error: string }> {
  const ids = [...new Set(notificationIds.map((id) => id.trim()).filter((id) => isUuid(id)))];
  if (ids.length === 0) return { ok: true, marked: 0 };

  try {
    const userId = await requireActionUserId();
    if (!userId) return { ok: false, error: "Sign in to update your inbox." };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", ids)
      .is("read_at", null)
      .select("id");

    if (error) {
      if (isMissingSchema(error)) return { ok: true, marked: 0 };
      throw error;
    }

    revalidateInbox();
    return { ok: true, marked: (data ?? []).length };
  } catch (caught) {
    console.error("markAsRead failed.", caught);
    return { ok: false, error: "We couldn't update those alerts. Please try again." };
  }
}
