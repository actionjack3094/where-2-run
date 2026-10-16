"use client";

import Link from "next/link";
import { BallotCandidate } from "@/app/elections/ballot-candidate";
import { ZipGate } from "@/app/elections/ballot-zip-gate";
import { dedupeBallotRaces } from "@/lib/elections/ballot-races";
import type { VoterBallotPanel } from "@/lib/elections/hub-types";

export function BallotPanel({ panel }: { panel: VoterBallotPanel }) {
  const races = dedupeBallotRaces(panel.races);

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
      {!panel.signedOut && !panel.needsZip && !panel.notice && races.length === 0 ? (
        <p className="mt-8 text-sm leading-6 text-stone-600">No races are filed for this voting ZIP yet.</p>
      ) : null}
      {races.length > 0 ? (
        <ul className="mt-8 grid gap-4">
          {races.map((race) => (
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
                    <BallotCandidate key={`${candidate.primaryId}:${candidate.id}`} candidate={candidate} />
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
