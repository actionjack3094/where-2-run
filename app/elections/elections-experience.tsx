"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SupportPledgeButton } from "@/app/ballot/support-pledge";
import { saveTier1Zip } from "@/lib/actions/onboarding-funnel";
import type {
  ElectionsTab,
  MatchedPrimaryCard,
  VoterBallotPanel,
} from "@/lib/elections/hub-types";
import { cn } from "@/lib/utils";

const TABS: { id: ElectionsTab; href: string; label: string }[] = [
  { id: "matched", href: "/", label: "Matched Primaries" },
  { id: "ballot", href: "/?tab=ballot", label: "My Voter Ballot" },
  { id: "directory", href: "/?tab=directory", label: "State Directory" },
];

const DIRECTORY = [
  {
    id: "federal",
    title: "Federal Seats",
    body: "President, Senate, and House seats.",
  },
  {
    id: "state",
    title: "State Legislature",
    body: "State senate, state house, and statewide offices.",
  },
  {
    id: "local",
    title: "Municipal & Local",
    body: "County, city, school, and municipal seats.",
  },
] as const;

export function ElectionsExperience({
  tab,
  matched,
  ballot,
}: {
  tab: ElectionsTab;
  matched: { calibrated: boolean; notice: string | null; races: MatchedPrimaryCard[] } | null;
  ballot: VoterBallotPanel | null;
}) {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <nav aria-label="Elections" className="rounded-xl border border-stone-200 bg-white p-1">
          <div role="tablist" className="grid gap-1 sm:grid-cols-3">
            {TABS.map((item) => {
              const active = item.id === tab;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "inline-flex h-10 items-center justify-center rounded-lg px-3 text-center text-[11px] font-semibold uppercase tracking-widest transition-colors",
                    active ? "bg-stone-900 text-stone-50" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {tab === "matched" && matched ? <MatchedPanel feed={matched} /> : null}
        {tab === "ballot" && ballot ? <BallotPanel panel={ballot} /> : null}
        {tab === "directory" ? <DirectoryPanel /> : null}
      </div>
    </main>
  );
}

function MatchedPanel({
  feed,
}: {
  feed: { calibrated: boolean; notice: string | null; races: MatchedPrimaryCard[] };
}) {
  return (
    <section className="mt-8" aria-labelledby="matched-primaries-heading">
      <header>
        <h1 id="matched-primaries-heading" className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Matched Primaries
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          Ranked by Euclidean alignment with your vector. A district debate moves In-District Resonance.
        </p>
      </header>
      {feed.notice ? <p className="mt-6 text-sm leading-6 text-stone-600">{feed.notice}</p> : null}
      {!feed.calibrated && !feed.notice ? (
        <article className="mt-8 rounded-2xl border border-amber-500/40 bg-white px-6 py-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            Calibrate your political compass to unlock your matched primaries
          </h2>
          <Link
            href="/onboarding"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-stone-900 px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-50"
          >
            Start calibration
          </Link>
        </article>
      ) : null}
      {feed.calibrated && feed.races.length === 0 && !feed.notice ? (
        <p className="mt-8 text-sm leading-6 text-stone-600">No open primaries are on the board yet.</p>
      ) : null}
      {feed.races.length > 0 ? (
        <ul className="mt-8 grid gap-4">
          {feed.races.map((race) => (
            <li key={race.id} className="rounded-2xl border border-amber-500/30 bg-white px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-stone-900">{race.title}</h2>
                <p className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold tabular-nums text-amber-900">
                  {race.match}% Match
                </p>
              </div>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">
                Constituent agenda
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-800">{race.question}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={race.floorHref}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
                >
                  Take the Floor
                </Link>
                <Link
                  href={race.campaignHref}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-800 hover:border-amber-600"
                >
                  Explore Running
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BallotPanel({ panel }: { panel: VoterBallotPanel }) {
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

function DirectoryPanel() {
  return (
    <section className="mt-8" aria-labelledby="state-directory-heading">
      <header>
        <h1 id="state-directory-heading" className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          State Directory
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          Pick a map, then a state, to browse the races on it.
        </p>
      </header>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {DIRECTORY.map((tier) => (
          <li key={tier.id}>
            <Link
              href={`/elections/states?tier=${tier.id}`}
              className="flex min-h-44 flex-col justify-between rounded-2xl border border-amber-500/40 bg-white px-5 py-6 transition hover:-translate-y-0.5 hover:border-amber-600"
            >
              <span className="font-display text-2xl font-semibold tracking-tight text-stone-900">{tier.title}</span>
              <span className="mt-6 text-sm leading-6 text-stone-600">{tier.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
