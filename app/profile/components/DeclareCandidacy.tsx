"use client";

import { useEffect, useId, useState } from "react";
import { declareCandidacy, listHomeElections, type HomeElectionOption } from "@/lib/actions/campaign-targets";
import { Button } from "@/components/ui/button";

export function DeclareCandidacy({
  onDeclared,
}: {
  onDeclared: () => void | Promise<void>;
}) {
  const titleId = useId();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [races, setRaces] = useState<HomeElectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await listHomeElections();
        if (cancelled) return;
        setRaces(next);
        setSelectedId((current) => current || next[0]?.id || "");
      } catch {
        if (!cancelled) setRaces([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await declareCandidacy(selectedId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      await onDeclared();
    } catch {
      setError("We couldn't declare that race. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="run-for-office-heading">
      <article className="rounded-xl border border-gold/50 bg-zinc-900 px-6 py-8 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
        <p className="text-[11px] font-medium uppercase tracking-widest text-gold">Campaign Hub</p>
        <h2
          id="run-for-office-heading"
          className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment"
        >
          Run for Office
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
          Declare a race in your district to open your escrow vault and start an alignment
          streak at zero.
        </p>
        <Button
          type="button"
          variant="gold"
          size="lg"
          className="mt-6"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Choose a race
        </Button>
      </article>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg rounded-xl border border-gold/50 bg-zinc-900 px-6 py-6"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              Declare candidacy
            </p>
            <h3
              id={titleId}
              className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment"
            >
              Pick your race
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Upcoming elections that match your district.
            </p>

            {loading ? (
              <p className="mt-6 text-sm leading-6 text-zinc-400">Loading local races…</p>
            ) : races.length === 0 ? (
              <p className="mt-6 text-sm leading-6 text-zinc-400">
                No upcoming races in your district yet. Finish onboarding so we can match a
                ZIP to a congressional seat.
              </p>
            ) : (
              <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
                <label className="flex flex-col gap-2" htmlFor={selectId}>
                  <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Local race
                  </span>
                  <select
                    id={selectId}
                    name="electionId"
                    value={selectedId}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                      setError(null);
                    }}
                    className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-3 text-sm text-parchment outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  >
                    {races.map((race) => (
                      <option key={race.id} value={race.id}>
                        {race.label}
                      </option>
                    ))}
                  </select>
                </label>

                {error ? (
                  <p className="text-sm leading-6 text-rose-300" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="gold" disabled={busy || !selectedId}>
                    {busy ? "Declaring…" : "Declare candidacy"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
