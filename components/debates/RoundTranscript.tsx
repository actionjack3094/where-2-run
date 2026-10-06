import { cn } from "@/lib/utils";
import type { RoundPair } from "@/lib/debates/round-state";

export function RoundTranscript({
  rounds,
  candidateAName = "Candidate A",
  candidateBName = "Candidate B",
  activeRound,
  aVotes,
  bVotes,
  weighted = false,
  layout = "stack",
}: {
  rounds: RoundPair[];
  candidateAName?: string;
  candidateBName?: string;
  activeRound?: number;
  aVotes?: number;
  bVotes?: number;
  /** True when the vote counts are weighted totals rather than raw ballots. */
  weighted?: boolean;
  layout?: "stack" | "split";
}) {
  const voteUnit = (count: number) => (weighted ? "weighted votes" : count === 1 ? "vote" : "votes");
  const showVotes = aVotes !== undefined && bVotes !== undefined;
  const split = layout === "split";

  return (
    <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto">
      {rounds.map((pair) => (
        <div key={pair.round} className="flex flex-col gap-4">
          {rounds.length > 1 ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">
              Round {pair.round}
              {activeRound === pair.round ? " · in progress" : ""}
            </p>
          ) : null}
          <div className={cn("flex flex-col gap-4", split && "md:grid md:grid-cols-2")}>
            <article className="rounded-xl border border-gold/40 bg-white px-5 py-5">
              <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800">
                {candidateAName}
              </p>
              <h3 className="mt-2 text-sm font-medium text-stone-900">
                {pair.round === 1 ? "Stance" : "Rebuttal"}
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                {pair.a ?? "Opening stance will appear here."}
              </p>
              {showVotes && pair.round === rounds.length ? (
                <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-stone-900">
                  {aVotes}{" "}
                  <span className="text-xs font-normal text-stone-600">{voteUnit(aVotes ?? 0)}</span>
                </p>
              ) : null}
            </article>
            <article className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
              <p className="text-[11px] font-medium uppercase tracking-widest text-stone-600">
                {candidateBName}
              </p>
              <h3 className="mt-2 text-sm font-medium text-stone-900">
                {pair.round === 1 ? "Counter-stance" : "Counter-rebuttal"}
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                {pair.b ?? "Counter-stance will appear here."}
              </p>
              {showVotes && pair.round === rounds.length ? (
                <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-stone-900">
                  {bVotes}{" "}
                  <span className="text-xs font-normal text-stone-600">{voteUnit(bVotes ?? 0)}</span>
                </p>
              ) : null}
            </article>
          </div>
        </div>
      ))}
    </div>
  );
}
