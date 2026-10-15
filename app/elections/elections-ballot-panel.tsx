"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SupportPledgeButton } from "@/app/ballot/support-pledge";
import { saveTier1Zip } from "@/lib/actions/onboarding-funnel";
import type { VoterBallotPanel } from "@/lib/elections/hub-types";

export function BallotPanel({ panel }: { panel: VoterBallotPanel }) {
  return (
    <section className="mt-8" aria-labelledby="voter-ballot-heading">
      <header>
        <h1 id="voter-ballot-heading" className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          My Voter Ballot
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          Races and declared candidates in your registered home district.
          {panel.districtLabel ? ` ${panel.districtLabel}.` : ""}
        </p>
      </header>
      {panel.notice ? <p className="mt-6 text-sm leading-6 text-stone-600">{panel.notice}</p> : null}
      {panel.signedOut ? (
        <article className="mt-8 rounded-2xl border border-amber-500/40 bg-white px-6 py-8">
          <h2 className="font-display text-2xl font-semibold text-stone-900">Sign in to open your home ballot</h2>
          <Link
            href="/auth/login?next=%2F%3Ftab%3Dballot"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-stone-900 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-50"
          >
            Sign in
          </Link>
        </article>
      ) : null}
      {panel.needsZip ? <ZipGate /> : null}
      {!panel.signedOut && !panel.needsZip && !panel.notice && panel.races.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-stone-600">No races are filed for this voting ZIP yet.</p>
      ) : null}
      {panel.races.length > 0 ? (
        <ul className="mt-8 grid gap-4">
          {panel.races.map((race) => (
            <li key={race.id} className="rounded-2xl border border-amber-500/30 bg-white px-5 py-5">
              <h2 className="text-lg font-semibold text-stone-900">{race.title}</h2>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Local Q&A</p>
              <p className="mt-2 text-sm leading-6 text-stone-800">
                {race.question ?? "No constituent question is filed for this district yet."}
              </p>
              {race.qaHref ? (
                <Link href={race.qaHref} className="mt-2 inline-flex text-sm text-amber-800">
                  Open local Q&A
                </Link>
              ) : null}
              {race.candidates.length === 0 ? (
                <p className="mt-4 text-sm text-stone-600">No declared candidate in this primary yet.</p>
              ) : (
                <ul className="mt-4 grid gap-4">
                  {race.candidates.map((candidate) => (
                    <li key={`${candidate.primaryId}:${candidate.id}`} className="border-t border-stone-200 pt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/profile/${candidate.id}`} className="text-sm font-semibold text-stone-900 hover:text-amber-800">
                          {candidate.name}
                        </Link>
                        <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
                          {candidate.party} · {candidate.tierLabel}
                        </p>
                      </div>
                      {candidate.canPledge ? (
                        <SupportPledgeButton
                          candidateId={candidate.id}
                          candidateName={candidate.name}
                          primaryId={candidate.primaryId}
                          pledged={candidate.pledged}
                          signedIn
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ZipGate() {
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
