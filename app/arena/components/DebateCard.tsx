"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppealModal } from "@/app/arena/components/AppealModal";
import { PledgeEscrowButton } from "@/components/pledges/PledgeEscrowButton";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  canFileAddendum,
  confidenceThresholdCopy,
  governingEvaluation,
  MARGINAL_CONFIDENCE_MAX,
  MARGINAL_CONFIDENCE_MIN,
  parseScore,
} from "@/lib/arena/evaluations";
import { parseElo } from "@/lib/arena/elo";
import { cn } from "@/lib/utils";
import type { ArenaFeedCandidate, ArenaFeedDebate } from "@/lib/arena/feed-types";
import type { DebateEvaluation } from "@/types/database.types";

function statusLabel(status: string) {
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  if (status === "completed") return "Completed";
  if (status === "expired") return "Expired";
  return "Active";
}

function evaluationFor(
  evaluations: DebateEvaluation[],
  candidateId: string | undefined,
) {
  if (!candidateId) return null;
  return evaluations.find((row) => row.candidate_id === candidateId) ?? null;
}

export function DebateCard({ debate }: { debate: ArenaFeedDebate }) {
  const [evaluations, setEvaluations] = useState(debate.evaluations);
  const [appealOpen, setAppealOpen] = useState(false);

  const governing = useMemo(
    () => governingEvaluation(evaluations),
    [evaluations],
  );
  const appealReady = canFileAddendum(governing);
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
            {statusLabel(debate.status)}
          </span>
          {debate.districtName ? (
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
        <Link href={`/arena/${debate.id}`} className="group block">
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
          candidateA={debate.candidateA}
          candidateB={debate.candidateB}
          electionId={debate.districtId}
          appealReady={appealReady}
          onAppeal={() => setAppealOpen(true)}
        />
      </CardContent>

      {appealOpen && governing ? (
        <AppealModal
          evaluation={governing}
          onClose={() => setAppealOpen(false)}
          onSettled={(next) => {
            setEvaluations((current) =>
              current.map((row) => (row.id === next.id ? next : row)),
            );
            setAppealOpen(false);
          }}
        />
      ) : null}
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
        <span>{MARGINAL_CONFIDENCE_MIN.toFixed(2)} jury</span>
        <span>0.90 lock</span>
        <span>1.00</span>
      </div>
    </div>
  );
}

function PledgeActionRow({
  candidateA,
  candidateB,
  electionId,
  appealReady,
  onAppeal,
}: {
  candidateA: ArenaFeedCandidate | null;
  candidateB: ArenaFeedCandidate | null;
  electionId: string | null;
  appealReady: boolean;
  onAppeal: () => void;
}) {
  const seated = [candidateA, candidateB].filter(
    (candidate): candidate is ArenaFeedCandidate => Boolean(candidate),
  );
  const [pickedId, setPickedId] = useState(seated[0]?.id ?? "");
  const winner = seated.find((candidate) => candidate.id === pickedId) ?? seated[0] ?? null;

  return (
    <div className="flex flex-col gap-3 border-t border-primary/20 pt-4">
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
          <PledgeEscrowButton
            candidateId={winner.id}
            candidateName={winner.username}
            electionId={electionId}
            className="w-full max-w-none sm:max-w-xs"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Seats are still open. Pledges unlock when a candidate is on the ticket.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full shrink-0 sm:w-auto"
          disabled={!appealReady}
          title={
            appealReady
              ? "File a 150-word clarification addendum"
              : `Unlocks when AI confidence is between ${MARGINAL_CONFIDENCE_MIN.toFixed(2)} and ${MARGINAL_CONFIDENCE_MAX.toFixed(2)}`
          }
          onClick={onAppeal}
        >
          Appeal to Local Jury
        </Button>
      </div>
    </div>
  );
}
