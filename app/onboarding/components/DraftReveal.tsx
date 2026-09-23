"use client";

import { useEffect, useState } from "react";
import { completeOnboarding, loadDraftReveal } from "@/app/actions/onboarding/wizard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/db/supabase";
import { jurisdictionLabels } from "@/lib/civic-fencing";
import { formatViabilityScore } from "@/lib/math/viability";
import type { ViableRace } from "@/lib/onboarding/draft-races";

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  if (digest.startsWith("NEXT_REDIRECT")) return true;
  return error instanceof Error && error.message === "NEXT_REDIRECT";
}

export function DraftReveal({ onBack }: { onBack: () => void }) {
  const [races, setRaces] = useState<ViableRace[]>([]);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await accessToken();
        const reveal = await loadDraftReveal(token);
        if (cancelled) return;
        setRaces(reveal.races);
        setJurisdictions(jurisdictionLabels(reveal.ocdIds, 3));
        setError(null);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not read your draft card.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enterArena() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await accessToken();
      await completeOnboarding(token);
    } catch (caught) {
      if (isNextRedirectError(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "Could not enter the arena.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="draft-reveal-heading">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          Step 03
        </p>
        <h2
          id="draft-reveal-heading"
          className="mt-2 font-display text-3xl font-semibold tracking-tight text-parchment"
        >
          Your draft card
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          {jurisdictions.length > 0
            ? `Calibrated against ${jurisdictions.join(", ")}.`
            : "The three races where this vector is most viable."}
        </p>
      </header>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-400">Reading your draft card…</p>
      ) : races.length === 0 ? (
        <p className="mt-8 rounded-xl border border-gold/40 bg-zinc-900 px-5 py-6 text-sm leading-6 text-zinc-300">
          No open races match these divisions yet. You can still enter the arena.
        </p>
      ) : (
        <ol className="mt-8 flex flex-col gap-4">
          {races.map((race, index) => (
            <li
              key={race.electionId}
              className="rounded-xl border border-gold/50 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                    {index === 0 ? "Most viable" : `Rank ${index + 1}`}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
                    {race.officeName}
                  </h3>
                  {race.districtName && race.districtName !== race.officeName ? (
                    <p className="mt-1 text-sm text-zinc-400">{race.districtName}</p>
                  ) : null}
                  {race.incumbentName ? (
                    <p className="mt-2 text-sm text-zinc-400">Incumbent {race.incumbentName}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-gold">
                    {formatViabilityScore(race.viability)}
                  </p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Overall Viability Score
                  </p>
                </div>
              </div>
              <dl className="mt-5 grid gap-2 border-t border-zinc-800 pt-4 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-zinc-400">Primary Win Odds</dt>
                  <dd className="font-medium tabular-nums text-parchment">{race.primaryMatch}%</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-zinc-400">General Path</dt>
                  <dd className="font-medium text-parchment">{race.generalPath}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}

      {error ? (
        <p className="mt-6 text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        <Button
          type="button"
          variant="gold"
          size="lg"
          className="h-12 w-full"
          disabled={loading || busy}
          onClick={() => void enterArena()}
        >
          {busy ? "Entering the arena…" : "Enter the Arena"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onBack}>
          Back
        </Button>
      </div>
    </section>
  );
}
