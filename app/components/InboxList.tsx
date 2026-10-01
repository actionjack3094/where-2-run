"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markAsRead } from "@/lib/actions/inbox";
import { notifyInboxUpdated, type InboxItem } from "@/lib/notifications/inbox-shared";
import { formatRelativeTime } from "@/lib/pledges";
import { cn } from "@/lib/utils";

export function InboxList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const unreadIds = items.filter((item) => item.readAt == null).map((item) => item.id);

  async function markAll() {
    if (unreadIds.length === 0 || pending) return;
    setPending(true);
    await markAsRead(unreadIds);
    notifyInboxUpdated();
    setPending(false);
    router.refresh();
  }

  async function openItem(item: InboxItem) {
    if (item.readAt == null) {
      await markAsRead([item.id]);
      notifyInboxUpdated();
    }
  }

  return (
    <div className="mt-10">
      {unreadIds.length > 0 ? (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void markAll()}
          >
            Mark all as read
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const unread = item.readAt == null;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() => void openItem(item)}
                className={cn(
                  "block rounded-xl border px-5 py-5 transition-colors hover:border-gold hover:bg-zinc-900/80",
                  unread ? "border-sky-400/70 bg-zinc-900" : "border-gold/30 bg-zinc-950",
                )}
              >
                <p className="flex items-start gap-3 text-sm leading-6 text-parchment">
                  {unread ? (
                    <span
                      aria-hidden
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky-400"
                    />
                  ) : (
                    <span aria-hidden className="mt-2 h-2 w-2 shrink-0" />
                  )}
                  <span className={unread ? "font-semibold" : "font-normal"}>
                    {item.message}
                  </span>
                </p>
                <p className="mt-2 pl-5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                  {formatRelativeTime(item.createdAt)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
