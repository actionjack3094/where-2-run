"use client";

import { Flag } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { reportDebate } from "@/lib/actions/moderation";

export function ReportDebateButton({
  debateId,
  viewerId,
  participants,
}: {
  debateId: string;
  viewerId: string | null;
  participants: { id: string; name: string }[];
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [offenderId, setOffenderId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState(false);

  const targets = participants.filter((person) => person.id && person.id !== viewerId);
  const selected = targets.find((person) => person.id === offenderId) ?? targets[0];

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!viewerId || targets.length === 0 || filed) {
    if (filed) return <p className="text-[11px] uppercase tracking-widest text-zinc-500">Reported</p>;
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOffenderId(targets[0]?.id ?? "");
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500 hover:text-parchment"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        Report
      </button>
      {open && selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 px-4 py-8 sm:items-center"
          onClick={() => {
            if (!pending) setOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              setPending(true);
              setError(null);
              void reportDebate(debateId, selected.id, reason).then((result) => {
                setPending(false);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setFiled(true);
                setOpen(false);
                setReason("");
              });
            }}
          >
            <h2 id={titleId} className="font-display text-xl text-parchment">
              Report {selected.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Tell a moderator what should come off the arena.
            </p>
            {targets.length > 1 ? (
              <fieldset className="mt-4 grid gap-2">
                <legend className="text-[11px] uppercase tracking-widest text-zinc-500">Who</legend>
                {targets.map((person) => (
                  <label key={person.id} className="flex items-center gap-2 text-sm text-zinc-200">
                    <input
                      type="radio"
                      name="offender"
                      checked={selected.id === person.id}
                      onChange={() => setOffenderId(person.id)}
                    />
                    {person.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="mt-4 grid gap-2 text-sm text-zinc-300">
              Reason
              <textarea
                required
                minLength={3}
                maxLength={1000}
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
              />
            </label>
            {error ? <p className="mt-3 text-sm text-zinc-300">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="text-sm text-zinc-400 hover:text-parchment"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950 disabled:opacity-50"
              >
                {pending ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
