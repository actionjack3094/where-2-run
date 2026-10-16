"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveTier1Zip } from "@/lib/actions/onboarding-funnel";

export function ZipGate() {
  const router = useRouter();
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await saveTier1Zip(zip);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not match that ZIP.");
      setPending(false);
    }
  }

  return (
    <article className="mt-8 rounded-2xl border border-amber-500/40 bg-white px-6 py-8">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
        Add your voting ZIP to open your home ballot
      </h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">
        My Voter Ballot stays closed until a voting ZIP is on your profile.
      </p>
      <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <label className="grid gap-2 text-sm text-stone-600">
          Voting ZIP
          <input
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            required
            minLength={5}
            maxLength={10}
            placeholder="78704"
            value={zip}
            onChange={(event) => setZip(event.target.value)}
            className="h-11 max-w-[12rem] rounded-lg border border-stone-300 bg-white px-3 text-stone-900 outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-gold/60"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-60"
        >
          {pending ? "Matching district…" : "Unlock ballot"}
        </button>
        {error ? <p className="text-sm leading-6 text-rose-700">{error}</p> : null}
      </form>
    </article>
  );
}
