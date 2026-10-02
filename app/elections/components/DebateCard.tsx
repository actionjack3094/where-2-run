"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { castSpectatorVote } from "@/app/actions/debate/cast-spectator-vote";
import { BountyButton } from "@/components/debates/BountyModal";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  confidenceThresholdCopy,
  governingEvaluation,
  MARGINAL_CONFIDENCE_MAX,
  MARGINAL_CONFIDENCE_MIN,
  parseScore,
} from "@/lib/arena/evaluations";
import { parseElo } from "@/lib/arena/elo";
import { cn } from "@/lib/utils";
import type { ArenaFeedCandidate, ArenaFeedDebate } from "@/lib/arena/feed-types";
import { supabase } from "@/lib/supabase/client";
import type { DebateEvaluation } from "@/types/database.types";

type SpectatorTally = { a: number; b: number };

function statusLabel(status: string) {
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  if (status === "concluded") return "Concluded";
  if (status === "resolved") return "Resolved";
  if (status === "completed") return "Completed";
  if (status === "expired") return "Expired";
  return "Active";
}

function isFloorLocked(status: string) {
  return status === "concluded" || status === "resolved";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function voteChoice(row: Record<string, unknown>) {
  if (typeof row.selection === "string" && row.selection) return row.selection;
  if (typeof row.voted_for_user_id === "string") return row.voted_for_user_id;
  return null;
}

function evaluationFor(
  evaluations: DebateEvaluation[],
  candidateId: string | undefined,
) {
  if (!candidateId) return null;
  return evaluations.find((row) => row.candidate_id === candidateId) ?? null;
}

export function DebateCard({ debate }: { debate: ArenaFeedDebate }) {
  const evaluations = debate.evaluations;
  const [liveStatus, setLiveStatus] = useState(debate.status);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [tally, setTally] = useState<SpectatorTally>({ a: 0, b: 0 });
  const seatsRef = useRef({ a: debate.candidateA?.id ?? null, b: debate.candidateB?.id ?? null });
  seatsRef.current = { a: debate.candidateA?.id ?? null, b: debate.candidateB?.id ?? null };

  useEffect(() => {
    setLiveStatus(debate.status);
  }, [debate.status]);

  useEffect(() => {
    const seen = new Set<string>();
    let active = true;

    function addVote(row: Record<string, unknown>) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      const choice = voteChoice(row);
      const seats = seatsRef.current;
      setTally((current) => {
        if (choice && choice === seats.a) return { ...current, a: current.a + 1 };
        if (choice && choice === seats.b) return { ...current, b: current.b + 1 };
        return current;
      });
    }

    function applyDebate(row: Record<string, unknown>) {
      const status = typeof row.status === "string" ? row.status : "";
      if (!isFloorLocked(status)) return;
      setLiveStatus(status);
      setWinnerId(typeof row.winner_id === "string" ? row.winner_id : null);
    }

    async function loadExistingVotes() {
      const { data, error } = await supabase
        .from("debate_votes")
        .select("id, voted_for_user_id, selection")
        .eq("debate_id", debate.id);
      if (!active || error || !data) return;
      for (const row of data) addVote(row);
    }

    const channel = supabase
      .channel(`debate-floor:${debate.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "debate_votes",
          filter: `debate_id=eq.${debate.id}`,
        },
        (payload) => {
          const row = asRecord(payload.new);
          if (row) addVote(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "debates",
          filter: `id=eq.${debate.id}`,
        },
        (payload) => {
          const row = asRecord(payload.new);
          if (row) applyDebate(row);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadExistingVotes();
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [debate.id]);

  const governing = useMemo(
    () => governingEvaluation(evaluations),
    [evaluations],
  );
  const threshold = confidenceThresholdCopy(
    governing?.confidence_score,
    Boolean(governing),
  );
  const confidence = governing ? parseScore(governing.confidence_score) : 0;

  return (
    <Card className="overflow-hidden bg-card text-card-foreground">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-primary">
            {statusLabel(liveStatus)}
          </span>
          {debate.districtName && debate.electionSlug ? (
            <Link
              href={`/elections/${debate.electionSlug}/profile`}
              className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {debate.districtName}
            </Link>
          ) : debate.districtName ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {debate.districtName}
            </span>
          ) : null}
          {debate.matchPercent != null ? (
            <span className="rounded-full border border-primary/30 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest text-primary">
              {debate.matchPercent}% vector match
            </span>
          ) : null}
        </div>
        <Link href={`/debates/${debate.id}`} className="group block">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
            Policy prompt
          </p>
          <h2 className="mt-2 font-serif text-2xl font-semibold leading-snug tracking-tight text-parchment group-hover:text-primary">
            {debate.topic}
          </h2>
        </Link>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 divide-y divide-primary/25 overflow-hidden rounded-lg border border-primary/30 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <CandidatePane
            label="Candidate A"
            candidate={debate.candidateA}
            evaluation={evaluationFor(evaluations, debate.candidateA?.id)}
            align="start"
          />
          <CandidatePane
            label="Candidate B"
            candidate={debate.candidateB}
            evaluation={evaluationFor(evaluations, debate.candidateB?.id)}
            align="end"
          />
        </div>

        <section className="rounded-lg border border-primary/25 bg-zinc-950/60 px-4 py-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
                AI rubric score
              </p>
              <p className="mt-1 font-serif text-lg font-semibold tracking-tight text-parchment">
                {governing
                  ? `${parseScore(governing.primary_score).toFixed(1)} · ${threshold.label}`
                  : threshold.label}
              </p>
            </div>
            <p className="font-mono text-sm tabular-nums text-primary">
              {governing ? confidence.toFixed(2) : "—"} / 1.00
            </p>
          </div>
          <ConfidenceMeter value={confidence} hasEvaluation={Boolean(governing)} />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{threshold.detail}</p>
        </section>

        <PledgeActionRow
          debateId={debate.id}
          candidateA={debate.candidateA}
          candidateB={debate.candidateB}
          electionId={debate.districtId}
          tally={tally}
          floorLocked={isFloorLocked(liveStatus)}
          winnerId={winnerId}
        />
      </CardContent>
    </Card>
  );
}

function CandidatePane({
  label,
  candidate,
  evaluation,
  align,
}: {
  label: string;
  candidate: ArenaFeedCandidate | null;
  evaluation: DebateEvaluation | null;
  align: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 bg-zinc-950/40 p-4",
        align === "end" && "sm:items-end sm:text-right",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      {candidate ? (
        <Link
          href={`/candidate/${candidate.id}`}
          className={cn(
            "flex min-w-0 items-center gap-3",
            align === "end" && "sm:flex-row-reverse",
          )}
        >
          <CandidateAvatar name={candidate.username} size="md" />
          <span className="min-w-0 font-serif text-base font-semibold tracking-tight text-parchment hover:text-primary">
            {candidate.username}
          </span>
        </Link>
      ) : (
        <p className="font-serif text-base text-muted-foreground">Open seat</p>
      )}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          ELO
        </p>
        <p className="mt-1 font-serif text-3xl font-semibold tabular-nums tracking-tight text-primary">
          {candidate ? parseElo(candidate.elo_rating) : "—"}
        </p>
      </div>
      {evaluation ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          Rubric {parseScore(evaluation.primary_score).toFixed(1)} · conf{" "}
          {parseScore(evaluation.confidence_score).toFixed(2)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No rubric yet</p>
      )}
    </div>
  );
}

function ConfidenceMeter({
  value,
  hasEvaluation,
}: {
  value: number;
  hasEvaluation: boolean;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="mt-3">
      <div
        className="relative h-2 overflow-hidden rounded-full bg-zinc-800"
        role="meter"
        aria-label="AI confidence score"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={hasEvaluation ? clamped : 0}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: hasEvaluation ? `${clamped * 100}%` : "0%" }}
        />
        <span
          className="absolute inset-y-0 w-px bg-zinc-500"
          style={{ left: `${MARGINAL_CONFIDENCE_MIN * 100}%` }}
        />
        <span
          className="absolute inset-y-0 w-px bg-zinc-500"
          style={{ left: `${MARGINAL_CONFIDENCE_MAX * 100}%` }}
        />
        <span
          className="absolute inset-y-0 w-px bg-primary"
          style={{ left: "90%" }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>0.00</span>
        <span>{MARGINAL_CONFIDENCE_MIN.toFixed(2)} band</span>
        <span>0.90 lock</span>
        <span>1.00</span>
      </div>
    </div>
  );
}

function PledgeActionRow({
  debateId,
  candidateA,
  candidateB,
  electionId,
  tally,
  floorLocked,
  winnerId,
}: {
  debateId: string;
  candidateA: ArenaFeedCandidate | null;
  candidateB: ArenaFeedCandidate | null;
  electionId: string | null;
  tally: SpectatorTally;
  floorLocked: boolean;
  winnerId: string | null;
}) {
  const seated = [candidateA, candidateB].filter(
    (candidate): candidate is ArenaFeedCandidate => Boolean(candidate),
  );
  const [pickedId, setPickedId] = useState(seated[0]?.id ?? "");
  const winner = seated.find((candidate) => candidate.id === pickedId) ?? seated[0] ?? null;
  const [selection, setSelection] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function voteFor(candidateId: string) {
    setVoteError(null);
    startTransition(async () => {
      try {
        const next = await castSpectatorVote(debateId, candidateId);
        setSelection(next.selection);
      } catch (caught) {
        setVoteError(caught instanceof Error ? caught.message : "Could not record that response.");
      }
    });
  }

  const selectedName =
    selection === candidateA?.id
      ? candidateA.username
      : selection === candidateB?.id
        ? candidateB.username
        : null;
  const winnerName =
    winnerId && winnerId === candidateA?.id
      ? candidateA.username
      : winnerId && winnerId === candidateB?.id
        ? candidateB.username
        : null;

  return (
    <div className="flex flex-col gap-3 border-t border-primary/20 pt-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
          District response
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Logged for this district topic. It does not decide the debate.
        </p>
        <p className="mt-2 font-mono text-xs tabular-nums text-parchment">
          {candidateA?.username ?? "A"} {tally.a} · {candidateB?.username ?? "B"} {tally.b}
        </p>
      </div>
      {floorLocked ? (
        <p className="text-sm leading-6 text-parchment">
          {winnerName ? `${winnerName} is the winner.` : "The match ended in a tie."}
        </p>
      ) : null}
      {candidateA && candidateB ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={selection === candidateA.id ? "gold" : "outline"}
            disabled={floorLocked || pending || selection != null}
            onClick={() => voteFor(candidateA.id)}
          >
            {candidateA.username}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selection === candidateB.id ? "gold" : "outline"}
            disabled={floorLocked || pending || selection != null}
            onClick={() => voteFor(candidateB.id)}
          >
            {candidateB.username}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Seats are still open. Responses open when both debaters are seated.
        </p>
      )}
      {selectedName ? (
        <p className="text-xs text-muted-foreground">Recorded: {selectedName}</p>
      ) : null}
      {voteError ? <p className="text-xs text-muted-foreground">{voteError}</p> : null}

      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
        Escrow the winner
      </p>
      {seated.length > 1 ? (
        <div className="grid grid-cols-2 gap-2">
          {seated.map((candidate) => {
            const selected = candidate.id === winner?.id;
            return (
              <Button
                key={candidate.id}
                type="button"
                size="sm"
                variant={selected ? "gold" : "outline"}
                aria-pressed={selected}
                onClick={() => setPickedId(candidate.id)}
              >
                {candidate.username}
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {winner ? (
          <BountyButton
            candidateId={winner.id}
            candidateName={winner.username}
            electionId={electionId}
            debateId={debateId}
            className="w-full max-w-none sm:max-w-xs"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Seats are still open. Pledges unlock when a candidate is on the ticket.
          </p>
        )}
      </div>
    </div>
  );
}
