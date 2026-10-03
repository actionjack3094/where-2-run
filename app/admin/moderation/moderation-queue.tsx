"use client";

import { useState } from "react";
import { banUser, dismissFlag } from "@/lib/actions/moderation";
import type { PendingFlag } from "@/lib/platform/moderation";

export function ModerationQueue({ flags }: { flags: PendingFlag[] }) {
  const [rows, setRows] = useState(flags);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(flag: PendingFlag, action: "dismiss" | "ban") {
    if (pendingId) return;
    if (action === "ban" && !window.confirm(`Ban ${flag.offenderName} and pull their open seats?`)) return;
    setPendingId(flag.id);
    setError(null);
    const result =
      action === "dismiss" ? await dismissFlag(flag.id) : await banUser(flag.id, flag.offenderId);
    setPendingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows((current) =>
      current.filter((row) =>
        action === "ban" ? row.offenderId !== flag.offenderId : row.id !== flag.id,
      ),
    );
  }

  if (rows.length === 0) {
    return <p className="mt-8 text-sm text-zinc-400">No pending reports.</p>;
  }

  return (
    <div className="mt-8 grid gap-4">
      {error ? <p className="text-sm text-zinc-300">{error}</p> : null}
      {rows.map((flag) => (
        <article key={flag.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-parchment">{flag.offenderName}</h2>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">
              {new Date(flag.createdAt).toLocaleString()}
            </p>
          </div>
          {flag.offenderEmail ? <p className="mt-1 text-sm text-zinc-400">{flag.offenderEmail}</p> : null}
          <p className="mt-4 text-[11px] uppercase tracking-widest text-zinc-500">Reason</p>
          <p className="mt-1 text-sm leading-6 text-zinc-200">{flag.reason}</p>
          <p className="mt-4 text-[11px] uppercase tracking-widest text-zinc-500">Reported stance</p>
          <p className="mt-1 max-h-40 overflow-hidden text-sm leading-6 text-zinc-300">{flag.stance}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pendingId === flag.id}
              onClick={() => void run(flag, "dismiss")}
              className="rounded-md border border-zinc-600 px-4 py-2 text-xs uppercase tracking-widest text-zinc-200 hover:border-zinc-400 disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={pendingId === flag.id}
              onClick={() => void run(flag, "ban")}
              className="rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950 disabled:opacity-50"
            >
              Ban User
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
