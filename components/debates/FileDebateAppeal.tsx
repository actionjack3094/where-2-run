"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fileDebateAppeal } from "@/lib/actions/jury-appeals";
import { Button } from "@/components/ui/button";
import { APPEAL_REASON_MAX } from "@/lib/jury-window";
import { supabase } from "@/lib/db/supabase";

export function FileDebateAppeal({
  debateId,
  pendingAppealId,
}: {
  debateId: string;
  /** Another constituent already filed; eligible jurors can go serve. */
  pendingAppealId?: string | null;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const grounds = reason.trim();
    if (!grounds || pending) return;
    setError(null);
    startTransition(async () => {
      const { data } = await supabase.auth.getSession();
      const result = await fileDebateAppeal(
        debateId,
        grounds,
        data.session?.access_token ?? null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/spectator/jury/${result.appealId}`);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <Button type="button" variant="gold" size="sm" onClick={() => setOpen(true)}>
        Appeal Decision
      </Button>
      {pendingAppealId ? (
        <Link
          href={`/spectator/jury/${pendingAppealId}`}
          className="text-[11px] font-medium uppercase tracking-widest text-gold hover:text-parchment"
        >
          Serve on the jury
        </Link>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg rounded-xl border border-gold/40 bg-zinc-950 px-5 py-5"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
              Local jury
            </p>
            <h2 id={titleId} className="mt-2 font-display text-xl font-semibold text-parchment">
              Appeal this decision
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Verified constituents of this district can contest the outcome within 24 hours.
              Three local jurors will review the transcript.
            </p>
            <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                  Reason
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={5}
                  maxLength={APPEAL_REASON_MAX}
                  disabled={pending}
                  placeholder="Explain why this outcome should be reviewed…"
                  className="min-h-32 w-full resize-y rounded-md border border-gold/40 bg-zinc-950 px-4 py-3 text-sm leading-6 text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60 disabled:opacity-60"
                />
                <span className="text-xs text-zinc-500">
                  {reason.trim().length} / {APPEAL_REASON_MAX}
                </span>
              </label>
              {error ? <p className="text-sm leading-6 text-red-300">{error}</p> : null}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="gold"
                  className="flex-1"
                  disabled={pending || !reason.trim()}
                >
                  {pending ? "Filing…" : "File appeal"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
