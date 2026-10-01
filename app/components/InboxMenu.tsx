"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LibertyBell } from "@/app/components/LibertyBell";
import { getInbox, markAsRead } from "@/lib/actions/inbox";
import { INBOX_PREVIEW, INBOX_UPDATED_EVENT, type InboxItem } from "@/lib/notifications/inbox-shared";
import { formatRelativeTime } from "@/lib/pledges";
import { cn } from "@/lib/utils";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread ${count === 1 ? "alert" : "alerts"}`}
      className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 text-[9px] font-semibold tabular-nums text-charcoal"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function InboxRow({
  item,
  onOpen,
}: {
  item: InboxItem;
  onOpen: (item: InboxItem) => void;
}) {
  const unread = item.readAt == null;
  return (
    <Link
      href={item.href}
      onClick={() => onOpen(item)}
      className={cn(
        "block px-3 py-2.5 text-left transition-colors hover:bg-parchment-light",
        unread ? "bg-sky-50/80" : "bg-transparent",
      )}
    >
      <p className="flex items-start gap-2 text-sm leading-5 text-charcoal">
        {unread ? (
          <span
            aria-hidden
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500"
          />
        ) : (
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0" />
        )}
        <span className={unread ? "font-semibold" : "font-normal"}>{item.message}</span>
      </p>
      <p className="mt-1 pl-3.5 text-[10px] uppercase tracking-widest text-charcoal-muted">
        {formatRelativeTime(item.createdAt)}
      </p>
    </Link>
  );
}

export function InboxMenu() {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await getInbox();
        if (cancelled) return;
        setItems(next.items);
        setUnread(next.unread);
      } catch {
        if (cancelled) return;
        setItems([]);
        setUnread(0);
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 20_000);
    window.addEventListener(INBOX_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(INBOX_UPDATED_EVENT, load);
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(item: InboxItem) {
    setOpen(false);
    if (item.readAt != null) return;
    setItems((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row,
      ),
    );
    setUnread((count) => Math.max(0, count - 1));
    await markAsRead([item.id]);
  }

  const preview = items.slice(0, INBOX_PREVIEW);
  const active = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative inline-flex items-center transition-colors",
          active || open ? "text-brass" : "text-brass-dark hover:text-brass",
        )}
      >
        <LibertyBell className="transition-colors" />
        <UnreadBadge count={unread} />
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-md border border-brass/50 bg-parchment shadow-lg sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-brass/30 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-widest text-charcoal">
              Inbox
            </p>
            <Link
              href="/inbox"
              onClick={() => setOpen(false)}
              className="text-[10px] font-medium uppercase tracking-widest text-brass hover:text-charcoal"
            >
              Open inbox
            </Link>
          </div>
          {preview.length === 0 ? (
            <p className="px-3 py-6 text-sm leading-6 text-charcoal-muted">
              No alerts yet. Pledges, appeals, and challenges will land here.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-brass/20 overflow-y-auto">
              {preview.map((item) => (
                <li key={item.id}>
                  <InboxRow item={item} onOpen={openItem} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
