import Link from "next/link";

const RACES = [
  {
    href: "/elections/tx-10-dem",
    name: "U.S. House · TX-10 Democratic Primary",
    standing: "1,340 AR · Tier 1 Contender",
  },
  {
    href: "/elections/tx-senate-dem",
    name: "U.S. Senate · TX",
    standing: "1,120 AR · Tier 3 Prospect",
  },
] as const;

export function CandidateFunnel() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">Candidate</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Candidate HQ & Multi-Primary Funnel
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            A signed-out preview of the primaries on this ticket and the toolkit that opens at Contender.
          </p>
        </header>
        <section className="mt-8">
          <h2 className="font-display text-xl text-stone-900">Matched primaries</h2>
          <ol className="mt-4 grid gap-3">
            {RACES.map((race) => (
              <li key={race.href}>
                <Link
                  href={race.href}
                  className="block rounded-xl border border-amber-500/30 bg-white px-5 py-4 hover:border-amber-600"
                >
                  <p className="text-sm font-medium text-stone-900">{race.name}</p>
                  <p className="mt-1 text-sm text-stone-600">{race.standing}</p>
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-8 rounded-xl border border-amber-500/30 bg-white px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-800">Unlocked</p>
          <h2 className="mt-2 font-display text-xl text-stone-900">Message Box Pro</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Campaign strategy toolkit for the TX-10 Democratic Primary.
          </p>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-stone-800">
            <li>Audience: Democratic primary voters from East Austin through Brenham.</li>
            <li>Anchor: Federal zoning follows transit, water, and classrooms that already exist.</li>
            <li>Floor: One opening, then the 48-hour rebuttal on the TX-10 clash.</li>
            <li>Filing: Tier 1 Contender unlocks the $3,125 escrow.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-4 text-[11px] font-medium uppercase tracking-widest">
            <Link href="/elections/tx-10-dem" className="text-amber-800">
              TX-10 primary
            </Link>
            <Link href="/debates" className="text-amber-800">
              Open clash
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
