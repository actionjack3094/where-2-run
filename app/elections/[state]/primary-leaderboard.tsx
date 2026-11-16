import Link from "next/link";
import { LenaEscrowPledge } from "@/components/escrow/lena-escrow-line";
import { ARENA_TIER_LADDER, getPrimaryTier } from "@/lib/arena-rank";
import { TX10_BOARD } from "@/lib/tx10-spine";
import type { LeaderRow } from "@/lib/platform/types";

function money(value: number) {
  return value.toLocaleString("en-US");
}

export function PrimaryLeaderboard({
  slug,
  ranked,
  unranked,
}: {
  slug: string;
  ranked: LeaderRow[];
  unranked: LeaderRow[];
}) {
  const tx10 = slug === "tx-10-dem";
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-stone-900">Leaderboard</h2>
      <ul className="mt-2 grid gap-1 text-sm text-stone-600">
        {ARENA_TIER_LADDER.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {tx10 ? (
        <ol className="mt-4 grid gap-3">
          {TX10_BOARD.map((row) => (
            <li key={row.name}>
              <Link href={row.href} className="block rounded-xl border border-amber-500/30 px-4 py-3 hover:border-amber-600">
                <p className="text-sm font-medium text-stone-900">
                  #{row.rank} {getPrimaryTier(row.ar)} · {row.name} · {money(row.ar)} AR
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {row.name === "Lena Ortiz" ? (
                    <LenaEscrowPledge match={row.match} />
                  ) : (
                    <>
                      {row.match}% Ideological Match · {row.escrow}
                    </>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      ) : ranked.length === 0 && unranked.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">No contenders on this primary ladder yet.</p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {[...ranked, ...unranked].map((row, index) => {
            const ar = row.civicStanding;
            const name = row.legalName ?? row.displayName;
            return (
              <li key={row.userId} className="rounded-xl border border-amber-500/30 px-4 py-3">
                <Link href={`/profile/${row.userId}`} className="text-sm font-medium text-stone-900 hover:text-amber-800">
                  #{index + 1} {getPrimaryTier(ar)} · {name} · {money(ar)} AR
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
