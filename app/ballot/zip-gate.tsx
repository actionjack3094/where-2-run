"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveTier1Zip } from "@/lib/actions/onboarding-funnel";

export function BallotZipGate({ signedOut }: { signedOut: boolean }) {
  const router = useRouter();
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
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
    <section className="px-4 py-16">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">District locked</p>
      <h2
        className="mt-3 text-2xl font-semibold leading-snug text-stone-900"
        style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
      >
        Enter your ZIP to unlock your ballot feed.
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-stone-600">
        My Ballot shows the active debates and policy statements in your district. A ZIP code opens that feed.
      </p>
      {signedOut ? (
        <Link
          href="/auth/login?next=/ballot"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
        >
          Sign in
        </Link>
      ) : (
        <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-sm text-stone-600">
            ZIP code
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
          {error ? <p className="text-sm leading-6 text-stone-600">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
