import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { parseElo } from "@/lib/arena/elo";
import type { ElectionDraftCandidate } from "@/lib/elections";

export function DraftLeaderboard({
  candidates,
}: {
  candidates: ElectionDraftCandidate[];
}) {
  return (
    <section aria-labelledby="draft-leaderboard-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          The field
        </p>
        <h2
          id="draft-leaderboard-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Draft leaderboard
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Prospective candidates ranked by debate ELO. Primary match is cosine
          alignment with this district&apos;s median voter.
        </p>
      </header>

      {candidates.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No one has filed this seat</CardTitle>
            <CardDescription>
              Candidates who target this district, or take a lectern on its
              prompts, appear here with W-L, ELO, and primary match.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ol className="mt-6 divide-y divide-gold/20 overflow-hidden rounded-xl border border-gold/40 bg-zinc-900">
          {candidates.map((candidate, index) => (
            <li key={candidate.id}>
              <Link
                href={`/candidate/${candidate.id}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-950"
              >
                <span className="w-8 font-display text-lg font-semibold tabular-nums text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <CandidateAvatar name={candidate.username} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold tracking-tight text-parchment">
                    {candidate.username}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    {candidate.record} debate record
                  </span>
                </span>
                <Stat label="W-L" value={candidate.record} />
                <Stat label="ELO" value={String(parseElo(candidate.eloRating))} />
                <Stat label="Primary match" value={`${candidate.primaryMatch}%`} accent />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="w-24 shrink-0 text-right">
      <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span
        className={
          accent
            ? "mt-1 block font-display text-lg font-semibold tabular-nums text-gold"
            : "mt-1 block font-display text-lg font-semibold tabular-nums text-parchment"
        }
      >
        {value}
      </span>
    </span>
  );
}
