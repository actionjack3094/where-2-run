import { CONTENDER_MIN, getPrimaryTier } from "@/lib/arena-rank";
import type { ArenaPublicProfile } from "@/lib/platform/public-profile";

const JAMES_ID = "b07a0001-0002-4000-8000-000000000002";

function tierPhrase(ar: number) {
  const name = getPrimaryTier(ar);
  const step = name === "Contender" ? "Tier 1" : name === "Challenger" ? "Tier 2" : "Tier 3";
  return `${step}: ${name} · ${ar.toLocaleString("en-US")} AR`;
}

export function ArenaRankSummary({ profile }: { profile: ArenaPublicProfile }) {
  const james = profile.id === JAMES_ID || profile.name === "James Harlan";
  const best = profile.standings.reduce((top, row) => Math.max(top, row.civicStanding), 0);
  const label = james ? "Tier 3: Prospect · 1,080 AR" : tierPhrase(best || 1000);
  const locked = james || best < CONTENDER_MIN;

  return (
    <div className="mt-4 max-w-xl">
      <p className="inline-flex rounded-full border border-gold px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-800">
        {label}
      </p>
      <p className="mt-3 text-sm text-stone-800">Ideological Match</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        {locked
          ? "Statutory Filing Escrow (Locked — Reach Tier 1 Contender at 1,300+ AR to unlock)"
          : "Statutory Filing Escrow Unlocked"}
      </p>
    </div>
  );
}
