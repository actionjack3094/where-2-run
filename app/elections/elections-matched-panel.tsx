import Link from "next/link";
import type { MatchedPrimaryCard } from "@/lib/elections/hub-types";

export function MatchedPanel({
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
