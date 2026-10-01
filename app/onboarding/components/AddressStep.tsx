"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveTier1Zip } from "@/lib/actions/onboarding-funnel";

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

export function AddressStep({
  onComplete,
}: {
  onComplete: (match: { zip: string; label: string }) => void;
}) {
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const match = await saveTier1Zip(zip);
      onComplete({ zip: match.zip, label: match.label });
    } catch (caught) {
      if (isNextRedirectError(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "Could not map that ZIP.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="address-heading">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
          Step 01 · Tier 1
        </p>
        <h2
          id="address-heading"
          className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Map your district
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          A residential ZIP is enough for a congressional match. 78704, for example,
          lands in Texas&apos;s 37th.
        </p>
      </header>

      <form className="mt-8 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            ZIP code
          </span>
          <input
            type="text"
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            placeholder="78704"
            value={zip}
            onChange={(event) => {
              setZip(event.target.value);
              setError(null);
            }}
            className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
          />
        </label>
        {error ? (
          <p className="text-sm leading-6 text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="gold" size="full" disabled={busy}>
          {busy ? "Matching district…" : "Match my district"}
        </Button>
      </form>
    </section>
  );
}
