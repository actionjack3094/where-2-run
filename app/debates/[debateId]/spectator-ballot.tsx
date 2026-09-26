"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CIVIC_FENCE_BALLOT_NOTICE } from "@/lib/civic-fencing";
import { castVote } from "./actions";

function BallotChoice({
  label,
  candidateId,
  hasVoted,
  selected,
  votes,
  share,
  pending,
  locked,
  onVote,
}: {
  label: string;
  candidateId: string;
  hasVoted: boolean;
  selected: boolean;
  votes: number;
  share: number;
  pending: boolean;
  locked: boolean;
  onVote: (candidateId: string) => void;
}) {
  const buttonClass =
    "w-full rounded-md border border-gold/50 px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-gold disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <article className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-gold">{label}</p>
      {hasVoted ? (
        <>
          <button type="button" disabled className={`mt-4 ${buttonClass}`}>
            {selected ? "Vote Cast" : `Vote ${label}`}
          </button>
          <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-parchment">
            {share}%
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {votes} {votes === 1 ? "vote" : "votes"}
          </p>
        </>
      ) : (
        <button
          type="button"
          disabled={locked}
          onClick={() => onVote(candidateId)}
          className={`mt-4 ${buttonClass}`}
        >
          {pending ? "Casting…" : `Vote ${label}`}
        </button>
      )}
    </article>
  );
}

export function SpectatorBallot({
  debateId,
  candidateAId,
  candidateBId,
  hasVoted,
  votedCandidateId,
  aVotes,
  bVotes,
  aShare,
  bShare,
}: {
  debateId: string;
  candidateAId: string;
  candidateBId: string;
  hasVoted: boolean;
  votedCandidateId: string | null;
  aVotes: number;
  bVotes: number;
  aShare: number;
  bShare: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function vote(candidateId: string) {
    if (pending || hasVoted) return;
    setError(null);
    setPendingId(candidateId);
    startTransition(async () => {
      try {
        await castVote(debateId, candidateId);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not cast a vote.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm leading-6 text-gold">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{CIVIC_FENCE_BALLOT_NOTICE}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <BallotChoice
          label="Candidate A"
          candidateId={candidateAId}
          hasVoted={hasVoted}
          selected={votedCandidateId === candidateAId}
          votes={aVotes}
          share={aShare}
          pending={pending && pendingId === candidateAId}
          locked={pending}
          onVote={vote}
        />
        <BallotChoice
          label="Candidate B"
          candidateId={candidateBId}
          hasVoted={hasVoted}
          selected={votedCandidateId === candidateBId}
          votes={bVotes}
          share={bShare}
          pending={pending && pendingId === candidateBId}
          locked={pending}
          onVote={vote}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm leading-6 text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
