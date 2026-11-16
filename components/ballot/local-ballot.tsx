"use client";

import { useState } from "react";
import Link from "next/link";
import { LENA_CANDIDATE_HREF } from "@/lib/tx10-spine";

const DEMO_ZIP = "78701";

export function LocalBallot({ className = "px-4 py-8" }: { className?: string }) {
  const [zip, setZip] = useState(DEMO_ZIP);
  const [unlocked, setUnlocked] = useState(DEMO_ZIP);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = zip.trim();
    if (/^\d{5}$/.test(next)) setUnlocked(next);
  }

  const preview = unlocked === DEMO_ZIP;

  return (
    <section className={className}>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="grid gap-2 text-sm text-stone-600">
          ZIP code
          <input
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            minLength={5}
            maxLength={10}
            placeholder="e.g., 78701"
            value={zip}
            onChange={(event) => setZip(event.target.value)}
            className="h-11 max-w-[12rem] rounded-lg border border-stone-300 bg-white px-3 text-stone-900 outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-gold/60"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
        >
          Unlock Local Ballot
        </button>
      </form>
      {preview ? (
        <ul className="mt-6 grid gap-3">
          <li className="rounded-2xl border border-amber-200/70 bg-white px-5 py-4">
            <Link href="/elections/tx-10-dem" className="text-sm font-semibold text-stone-900 hover:text-amber-800">
              U.S. House · TX-10
            </Link>
            <Link href={LENA_CANDIDATE_HREF} className="mt-2 block text-sm text-amber-800">
              Lena Ortiz · #2 Contender
            </Link>
          </li>
          <li className="rounded-2xl border border-amber-200/70 bg-white px-5 py-4">
            <Link href="/elections/TX?tier=federal" className="text-sm font-semibold text-stone-900 hover:text-amber-800">
              U.S. Senate · TX
            </Link>
          </li>
        </ul>
      ) : (
        <p className="mt-6 text-sm leading-6 text-stone-600">
          No preview ballot is filed for {unlocked}. Try 78701.
        </p>
      )}
    </section>
  );
}
