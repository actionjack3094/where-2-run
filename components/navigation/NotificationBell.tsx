"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell } from "lucide-react";

const ALERTS: { id: string; body: ReactNode }[] = [
  {
    id: "rebuttal-clock",
    body: (
      <>
        Caleb Nguyen accepted your challenge on Zoning Laws.{" "}
        <span className="text-amber-600 font-semibold">46 hours remaining</span> to post your rebuttal.
      </>
    ),
  },
  {
    id: "contender",
    body: "Lena Ortiz defeated #2 Contender in a TX-10 Clash (+54 AR) and unlocked her $3,125 Filing Escrow!",
  },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-900 transition-colors hover:bg-white"
      >
        <span className="relative">
          <Bell className="h-5 w-5" aria-hidden />
          {unread ? <span className="absolute -right-0.5 -top-0.5 bg-red-500 rounded-full h-2 w-2" /> : null}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-stone-200 shadow-xl rounded-xl z-50 overflow-hidden">
          <p className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Notifications</p>
          <ul>
            {ALERTS.map((alert) => (
              <li
                key={alert.id}
                className="p-4 border-b border-stone-100 text-sm text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                {alert.body}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setUnread(false)}
            className="block w-full text-xs text-stone-500 text-center p-2 bg-stone-50 hover:text-stone-800"
          >
            Mark all as read
          </button>
        </div>
      ) : null}
    </div>
  );
}
