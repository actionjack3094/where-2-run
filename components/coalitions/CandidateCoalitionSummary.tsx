import Link from "next/link";
import { CoalitionBadge } from "@/components/coalitions/CoalitionBadge";
import type { CandidateCoalitionSummary as Summary } from "@/lib/candidate-coalitions";

/** Coalition badges and incoming endorsements for a public candidate card. */
export function CandidateCoalitionSummary({
  summary,
  candidateName,
}: {
  summary: Summary;
  candidateName: string;
}) {
  const { coalitions, endorsements, endorsementCount } = summary;

  return (
    <section aria-labelledby="candidate-coalition-heading">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Coalition</p>
      <h2
        id="candidate-coalition-heading"
        className="mt-3 font-display text-xl font-semibold tracking-tight text-parchment"
      >
        Affiliation &amp; endorsements
      </h2>

      {coalitions.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          {candidateName} isn&apos;t seated in a coalition.
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-3">
          {coalitions.map((coalition) => (
            <li key={coalition.id} className="flex items-center gap-2">
              <CoalitionBadge name={coalition.name} />
              <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                {coalition.memberCount} {coalition.memberCount === 1 ? "member" : "members"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
        {endorsementCount === 0
          ? "No endorsements yet"
          : `${endorsementCount} ${endorsementCount === 1 ? "endorsement" : "endorsements"}`}
      </p>
      {endorsements.length > 0 ? (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {endorsements.map((endorsement) => (
            <li key={endorsement.endorserId}>
              <Link
                href={`/candidate/${endorsement.endorserId}`}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-parchment transition-colors hover:border-gold/60"
              >
                <span className="truncate">{endorsement.username}</span>
                <span className="ml-3 shrink-0 text-xs tabular-nums text-gold">
                  {endorsement.eloRating} ELO
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
