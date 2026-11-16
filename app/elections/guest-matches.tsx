import Link from "next/link";

const MATCHES = [
  {
    rank: 1,
    title: "U.S. House · TX-10 Democratic Primary",
    match: 92,
    href: "/elections/tx-10-dem",
  },
  {
    rank: 2,
    title: "U.S. Senate · TX Democratic Primary",
    match: 86,
    href: "/elections/TX?tier=federal",
  },
  {
    rank: 3,
    title: "Texas State House · District 49 Primary",
    match: 79,
    href: "/elections/TX?tier=state",
  },
] as const;

export function guestMatchedFeed() {
  return { calibrated: true, notice: null, races: [], guest: true as const };
}

export function GuestMatches() {
  return (
    <ol className="mt-8 grid gap-4">
      {MATCHES.map((race) => (
        <li key={race.rank}>
          <Link
            href={race.href}
            className="block rounded-2xl border border-amber-200/70 bg-white px-5 py-5 hover:border-amber-400"
          >
            <p className="text-lg font-semibold text-stone-900">
              {race.rank}. {race.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {race.match}% Ideological Match · Starting Rank: Tier 3 Prospect · 1,000 AR
            </p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
