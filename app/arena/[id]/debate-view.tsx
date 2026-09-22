"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { gradeDebate } from "@/app/actions/arbitration/grade-debate";
import { AppealModal } from "@/app/arena/components/AppealModal";
import { CommentSection } from "@/components/comments/CommentSection";
import { BackCandidateButton } from "@/components/pledges/BackCandidateButton";
import { CandidateSeat } from "@/components/pledges/CandidateSeat";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canFileAddendum,
  parseScore,
} from "@/lib/arena/evaluations";
import {
  waitForIdeologyGrader,
  type GraderToastState,
} from "@/lib/arena/grader";
import { ensureArenaUser, type ArenaUser } from "@/lib/arena/identity";
import { getExpiryState, TOTAL_ROUNDS } from "@/lib/arena/time";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";
import type {
  Argument,
  CommentWithAuthor,
  DebateCandidate,
  DebateEvaluation,
  DebateWithCandidates,
  Vote,
} from "@/types/database.types";

const SIMULATED_OPPONENT_ARGUMENT =
  "This is a simulated testing argument from the mock opponent. The district should freeze property taxes on primary residences and fund schools through a local budget ordinance.";

// TEMPORARY DEBUG: let seated candidates cast a ballot so tallies can be verified.
const ALLOW_CANDIDATE_DEBUG_VOTES = true;

function unwrapCandidate(
  value: DebateWithCandidates["candidate_a"],
): DebateCandidate | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function findArgument(
  args: Argument[],
  authorId: string | null,
  round: number,
) {
  if (!authorId) return null;
  return args.find((entry) => entry.author_id === authorId && entry.round_number === round) ?? null;
}

export function DebateView({
  debateId,
  comments,
}: {
  debateId: string;
  comments: CommentWithAuthor[];
}) {
  const router = useRouter();
  const [debate, setDebate] = useState<DebateWithCandidates | null>(null);
  const [args, setArgs] = useState<Argument[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [user, setUser] = useState<ArenaUser | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [votingFor, setVotingFor] = useState<"a" | "b" | null>(null);
  const [localVoteCandidateId, setLocalVoteCandidateId] = useState<string | null>(null);
  const [graderToast, setGraderToast] = useState<GraderToastState | null>(null);
  const [evaluations, setEvaluations] = useState<DebateEvaluation[]>([]);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const voteLockRef = useRef(false);
  const graderWaitRef = useRef(0);
  const judgeRequestRef = useRef(0);

  async function loadDebate() {
    const { data, error: debateError } = await supabase
      .from("debates")
      .select(
        `
        *,
        candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
        candidate_b:users!debates_candidate_b_id_fkey ( id, username )
      `,
      )
      .eq("id", debateId)
      .single();

    if (debateError || !data) {
      throw new Error(debateError?.message ?? "Debate not found.");
    }

    const [{ data: argumentRows }, { data: voteRows }, evaluationsResult] =
      await Promise.all([
        supabase
          .from("arguments")
          .select("*")
          .eq("debate_id", debateId)
          .order("round_number")
          .order("created_at"),
        supabase.from("votes").select("*").eq("debate_id", debateId),
        supabase.from("debate_evaluations").select("*").eq("debate_id", debateId),
      ]);

    setDebate(data as DebateWithCandidates);
    setArgs(argumentRows ?? []);
    setVotes(voteRows ?? []);
    if (!evaluationsResult.error) {
      setEvaluations((evaluationsResult.data ?? []) as DebateEvaluation[]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLocalVoteCandidateId(null);
      voteLockRef.current = false;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData.session?.user;
        if (sessionUser) {
          const { data: profile } = await supabase
            .from("users")
            .select("id, username")
            .eq("id", sessionUser.id)
            .maybeSingle();
          if (profile && !cancelled) setUser(profile);
        }
        await loadDebate();
        if (!cancelled) setStage("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the debate.");
          setStage("error");
        }
      }
    }

    void boot();
    const interval = window.setInterval(() => {
      void loadDebate().catch(() => undefined);
    }, 2500);

    return () => {
      cancelled = true;
      graderWaitRef.current += 1;
      window.clearInterval(interval);
    };
  }, [debateId]);

  useEffect(() => {
    if (graderToast !== "done" && graderToast !== "timeout") return;
    const timeout = window.setTimeout(() => setGraderToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [graderToast]);

  const candidateA = unwrapCandidate(debate?.candidate_a ?? null);
  const candidateB = unwrapCandidate(debate?.candidate_b ?? null);
  const expiry = debate ? getExpiryState(debate.expires_at) : null;
  const isCandidateA = Boolean(user && debate && user.id === debate.candidate_a_id);
  const isCandidateB = Boolean(user && debate && user.id === debate.candidate_b_id);
  const isCandidate = isCandidateA || isCandidateB;
  const existingVote = user ? votes.find((vote) => vote.voter_id === user.id) : undefined;
  const votedCandidateId = existingVote?.candidate_id ?? localVoteCandidateId;
  const hasVoted = Boolean(votedCandidateId);
  const isVotableStatus = debate?.status === "active" || debate?.status === "voting";
  const bothSeated = Boolean(debate?.candidate_a_id && debate?.candidate_b_id);
  const showVoteButtons = Boolean(
    (ALLOW_CANDIDATE_DEBUG_VOTES || !isCandidate) && isVotableStatus && bothSeated,
  );

  const nextTurn = useMemo(() => {
    if (!debate) return null;
    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      const aArg = findArgument(args, debate.candidate_a_id, round);
      if (!aArg) return { side: "a" as const, round };
      const bArg = findArgument(args, debate.candidate_b_id, round);
      if (!bArg) return { side: "b" as const, round };
    }
    return null;
  }, [args, debate]);

  const floorOpen =
    Boolean(nextTurn) &&
    bothSeated &&
    (debate?.status === "active" || debate?.status === "matching");
  const canSpeak =
    floorOpen &&
    ((nextTurn?.side === "a" && isCandidateA) || (nextTurn?.side === "b" && isCandidateB));
  const isOpponentTurn =
    floorOpen &&
    isCandidate &&
    ((nextTurn?.side === "a" && isCandidateB) || (nextTurn?.side === "b" && isCandidateA));
  const opponentSide = isCandidateA ? ("b" as const) : isCandidateB ? ("a" as const) : null;

  const myEvaluation = user
    ? evaluations.find((row) => row.candidate_id === user.id) ?? null
    : null;
  const appealUnlocked = canFileAddendum(myEvaluation);
  const roundsComplete = Boolean(debate && !nextTurn && bothSeated);
  const judgeEligible =
    isCandidate &&
    roundsComplete &&
    (debate?.status === "voting" || debate?.status === "completed");

  useEffect(() => {
    if (!appealUnlocked) setAppealOpen(false);
  }, [appealUnlocked]);

  useEffect(() => {
    if (!judgeEligible || myEvaluation) return;
    const requestId = ++judgeRequestRef.current;
    let cancelled = false;

    async function runJudge() {
      setJudgeBusy(true);
      setJudgeError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const result = await gradeDebate(debateId, sessionData.session?.access_token);
        if (cancelled || judgeRequestRef.current !== requestId) return;
        setEvaluations(result.evaluations);
      } catch (err) {
        if (cancelled || judgeRequestRef.current !== requestId) return;
        setJudgeError(
          err instanceof Error ? err.message : "The arbitration engine could not score this debate.",
        );
      } finally {
        if (!cancelled && judgeRequestRef.current === requestId) setJudgeBusy(false);
      }
    }

    void runJudge();
    return () => {
      cancelled = true;
    };
  }, [debateId, judgeEligible, myEvaluation]);

  const aVotes = votes.filter((vote) => vote.candidate_id === debate?.candidate_a_id).length;
  const bVotes = votes.filter((vote) => vote.candidate_id === debate?.candidate_b_id).length;
  const totalVotes = aVotes + bVotes;
  const aShare = totalVotes === 0 ? 0 : Math.round((aVotes / totalVotes) * 100);
  const bShare = totalVotes === 0 ? 0 : 100 - aShare;

  async function withUser() {
    const next = user ?? (await ensureArenaUser());
    setUser(next);
    return next;
  }

  async function handleJoin() {
    setBusy(true);
    setActionError(null);
    try {
      const actor = await withUser();
      const response = await fetch(`/api/arena/debates/${debateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateBId: actor.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not join.");
      await loadDebate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitArgument() {
    if (!nextTurn || !draft.trim()) return;
    setBusy(true);
    setActionError(null);
    const waitId = ++graderWaitRef.current;
    setGraderToast("analyzing");
    let filed: Pick<Argument, "id" | "author_id"> | null = null;
    let previousVector: unknown = null;
    try {
      const actor = await withUser();
      const { data: profile } = await supabase
        .from("users")
        .select("ideology_vector")
        .eq("id", actor.id)
        .maybeSingle();
      previousVector = profile?.ideology_vector ?? null;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/arena/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          match_id: debateId,
          round_number: nextTurn.round,
          argument_text: draft.trim(),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        argument?: Argument;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not lock in the argument.");
      if (payload.argument) {
        filed = { id: payload.argument.id, author_id: payload.argument.author_id };
      }
      setDraft("");
      await loadDebate();
      router.refresh();
    } catch (err) {
      if (graderWaitRef.current === waitId) setGraderToast(null);
      setActionError(err instanceof Error ? err.message : "Could not lock in the argument.");
    } finally {
      setBusy(false);
    }

    if (!filed || graderWaitRef.current !== waitId) return;

    setGraderToast("analyzing");
    const result = await waitForIdeologyGrader({
      authorId: filed.author_id,
      argumentId: filed.id,
      previousVector,
    });
    if (graderWaitRef.current !== waitId) return;
    setGraderToast(result);

    if (result === "done") {
      const { data: profile } = await supabase
        .from("users")
        .select("ideology_vector")
        .eq("id", filed.author_id)
        .maybeSingle();
      if (profile?.ideology_vector) {
        const stored =
          typeof profile.ideology_vector === "string"
            ? profile.ideology_vector
            : JSON.stringify(profile.ideology_vector);
        window.sessionStorage.setItem(STORAGE_KEYS.vector, stored);
      }
    }
  }

  async function handleSimulateOpponentTurn() {
    if (!nextTurn || !isOpponentTurn) return;
    setBusy(true);
    setActionError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/arena/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          match_id: debateId,
          round_number: nextTurn.round,
          argument_text: SIMULATED_OPPONENT_ARGUMENT,
          simulate_opponent: true,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not simulate the opponent turn.");
      await loadDebate();
      router.refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not simulate the opponent turn.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(votedFor: "a" | "b") {
    if (voteLockRef.current || busy || votingFor || hasVoted) return;
    voteLockRef.current = true;
    setVotingFor(votedFor);
    setActionError(null);
    const chosenCandidateId =
      votedFor === "a" ? debate?.candidate_a_id ?? null : debate?.candidate_b_id ?? null;
    try {
      const actor = await withUser();
      const alreadyCast = votes.find((vote) => vote.voter_id === actor.id);
      if (alreadyCast) {
        setLocalVoteCandidateId(alreadyCast.candidate_id);
        throw new Error("You already voted in this debate.");
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/arena/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          match_id: debateId,
          voted_for: votedFor,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status === 409 && chosenCandidateId) {
          setLocalVoteCandidateId(chosenCandidateId);
          await loadDebate();
        }
        throw new Error(payload.error ?? "Could not record the vote.");
      }
      if (chosenCandidateId) setLocalVoteCandidateId(chosenCandidateId);
      await loadDebate();
      router.refresh();
    } catch (err) {
      voteLockRef.current = false;
      setActionError(err instanceof Error ? err.message : "Could not record the vote.");
    } finally {
      setVotingFor(null);
    }
  }

  if (stage === "loading") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <p className="text-sm text-zinc-500">Opening the floor…</p>
        <CommentSection debateId={debateId} comments={comments} />
      </main>
    );
  }

  if (stage === "error" || !debate) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{error ?? "Debate not found."}</p>
        <Button asChild variant="ghost" className="mt-4 w-fit">
          <Link href="/arena">Back to Arena</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/arena"
          className="text-xs font-medium uppercase tracking-widest text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          ← Arena
        </Link>
        <Link
          href="/spectator"
          className="text-xs font-medium uppercase tracking-widest text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Donor Feed
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge>
          Round {Math.min(debate.current_round, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
        </Badge>
        {expiry && (
          <Badge
            className={cn(
              expiry.tone === "expired" && "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50",
              expiry.tone === "soon" && "border-amber-500 text-amber-700 dark:text-amber-400",
            )}
          >
            {expiry.label}
          </Badge>
        )}
        <Badge>{debate.status}</Badge>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight leading-tight">{debate.topic}</h1>
      <div className="mt-4">
        <CandidateSeatRow
          candidateA={candidateA}
          candidateB={candidateB}
          simulateSide={isOpponentTurn ? opponentSide : null}
          simulateBusy={busy}
          onSimulate={() => void handleSimulateOpponentTurn()}
        />
      </div>

      {!debate.candidate_b_id && !isCandidateA && (
        <Button type="button" className="mt-6 w-fit" onClick={() => void handleJoin()} disabled={busy}>
          Enter as Candidate B
        </Button>
      )}

      {actionError && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{actionError}</p>
      )}

      <section className="mt-10 flex flex-col gap-8">
        {Array.from({ length: TOTAL_ROUNDS }, (_, index) => {
          const round = index + 1;
          const aArg = findArgument(args, debate.candidate_a_id, round);
          const bArg = findArgument(args, debate.candidate_b_id, round);
          const isCurrentRound = round === debate.current_round;
          const showAComposer =
            canSpeak && isCurrentRound && nextTurn?.round === round && nextTurn.side === "a";
          const showBComposer =
            canSpeak && isCurrentRound && nextTurn?.round === round && nextTurn.side === "b";

          return (
            <div key={round} className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
                Round {round}
              </p>
              <ArgumentSlot
                label={candidateA?.username ?? "Candidate A"}
                argument={aArg}
                composer={
                  showAComposer
                    ? {
                        draft,
                        setDraft,
                        busy,
                        onSubmit: handleSubmitArgument,
                      }
                    : null
                }
              />
              <ArgumentSlot
                label={candidateB?.username ?? "Candidate B"}
                argument={bArg}
                emptyHint={debate.candidate_b_id ? "Awaiting argument" : "Waiting for a challenger"}
                composer={
                  showBComposer
                    ? {
                        draft,
                        setDraft,
                        busy,
                        onSubmit: handleSubmitArgument,
                      }
                    : null
                }
              />
            </div>
          );
        })}
      </section>

      {showVoteButtons && candidateA && candidateB && (
        <SpectatorVote
          candidateA={candidateA}
          candidateB={candidateB}
          votedCandidateId={votedCandidateId}
          votingFor={votingFor}
          onVote={(side) => void handleVote(side)}
        />
      )}

      {isCandidate && bothSeated && !showVoteButtons && (
        <p className="mt-10 text-sm text-zinc-500 dark:text-zinc-400">
          You are on the ticket. Spectators cast the votes.
        </p>
      )}

      <TallyBar
        candidateA={candidateA}
        candidateB={candidateB}
        aVotes={aVotes}
        bVotes={bVotes}
        aShare={aShare}
        bShare={bShare}
        totalVotes={totalVotes}
      />

      <ArbitrationPanel
        candidateA={candidateA}
        candidateB={candidateB}
        evaluations={evaluations}
        myEvaluation={myEvaluation}
        appealUnlocked={appealUnlocked}
        judgeBusy={judgeBusy}
        judgeError={judgeError}
        onOpenAppeal={() => setAppealOpen(true)}
      />

      <CommentSection debateId={debateId} comments={comments} />

      {graderToast && <GraderToast state={graderToast} />}
      {appealOpen && myEvaluation && (
        <AppealModal
          evaluation={myEvaluation}
          onClose={() => setAppealOpen(false)}
          onSettled={(next) => {
            setEvaluations((current) =>
              current.map((row) => (row.id === next.id ? next : row)),
            );
            setAppealOpen(false);
          }}
        />
      )}
    </main>
  );
}

function ArbitrationPanel({
  candidateA,
  candidateB,
  evaluations,
  myEvaluation,
  appealUnlocked,
  judgeBusy,
  judgeError,
  onOpenAppeal,
}: {
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  evaluations: DebateEvaluation[];
  myEvaluation: DebateEvaluation | null;
  appealUnlocked: boolean;
  judgeBusy: boolean;
  judgeError: string | null;
  onOpenAppeal: () => void;
}) {
  const evaluationFor = (candidateId: string | undefined) =>
    candidateId
      ? evaluations.find((row) => row.candidate_id === candidateId) ?? null
      : null;

  return (
    <section className="mt-12">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Primary Judge
          </p>
          <CardTitle>Automated arbitration</CardTitle>
          <CardDescription>
            {judgeBusy
              ? "The Primary Judge is scoring both filings against the public rubric."
              : "Confidence between 0.60 and 0.89 unlocks a 150-word addendum for the Ensemble Court."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <JudgeSeat
              label={candidateA?.username ?? "Candidate A"}
              evaluation={evaluationFor(candidateA?.id)}
            />
            <JudgeSeat
              label={candidateB?.username ?? "Candidate B"}
              evaluation={evaluationFor(candidateB?.id)}
            />
          </div>
          {judgeError && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{judgeError}</p>
          )}
          {appealUnlocked && myEvaluation && (
            <Button type="button" onClick={onOpenAppeal}>
              File addendum on {myEvaluation.rubric_flag?.replace(/_/g, " ")}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function JudgeSeat({
  label,
  evaluation,
}: {
  label: string;
  evaluation: DebateEvaluation | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">{label}</p>
      {evaluation ? (
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Score</dt>
            <dd className="tabular-nums">{parseScore(evaluation.primary_score).toFixed(1)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Confidence</dt>
            <dd className="tabular-nums">
              {parseScore(evaluation.confidence_score).toFixed(2)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Flag</dt>
            <dd>{evaluation.rubric_flag?.replace(/_/g, " ") ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Court</dt>
            <dd>
              {evaluation.status === "locked"
                ? evaluation.ensemble_result
                  ? "Pass · ELO locked"
                  : "Fail · ELO locked"
                : evaluation.status}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">Awaiting verdict</p>
      )}
    </div>
  );
}

function GraderToast({ state }: { state: GraderToastState }) {
  const label =
    state === "analyzing"
      ? "AI Grader analyzing response..."
      : state === "done"
        ? "AI Grader updated your ideology vector."
        : "AI Grader is still working.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
    >
      <p
        className={cn(
          "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-950",
          state === "analyzing" && "animate-pulse",
        )}
      >
        {label}
      </p>
    </div>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

function CandidateSeatRow({
  candidateA,
  candidateB,
  simulateSide,
  simulateBusy,
  onSimulate,
}: {
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  simulateSide: "a" | "b" | null;
  simulateBusy: boolean;
  onSimulate: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <CandidateSeat
          candidate={candidateA}
          nameClassName="text-sm font-medium text-zinc-950 dark:text-zinc-50"
        />
        {simulateSide === "a" && (
          <SimulateOpponentButton busy={simulateBusy} onSimulate={onSimulate} />
        )}
      </div>
      <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">vs</span>
      <div className="flex items-center gap-2">
        {simulateSide === "b" && (
          <SimulateOpponentButton busy={simulateBusy} onSimulate={onSimulate} />
        )}
        <CandidateSeat
          candidate={candidateB}
          align="end"
          emptyLabel="Open seat"
          nameClassName="text-sm font-medium text-zinc-950 dark:text-zinc-50"
        />
      </div>
    </div>
  );
}

function SimulateOpponentButton({
  busy,
  onSimulate,
}: {
  busy: boolean;
  onSimulate: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 px-2 text-[10px] font-medium uppercase tracking-widest"
      disabled={busy}
      onClick={onSimulate}
    >
      {busy ? "Simulating…" : "Simulate Opponent Turn"}
    </Button>
  );
}

function ConsistencyPill({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
        score >= 80
          ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
          : score >= 70
            ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
            : "border border-zinc-300 text-zinc-500 dark:border-zinc-700",
      )}
    >
      {score} consistency
    </span>
  );
}

function ArgumentSlot({
  label,
  argument,
  emptyHint = "Awaiting argument",
  composer,
}: {
  label: string;
  argument: Argument | null;
  emptyHint?: string;
  composer: {
    draft: string;
    setDraft: (value: string) => void;
    busy: boolean;
    onSubmit: () => Promise<void>;
  } | null;
}) {
  return (
    <Card className={cn(!argument && !composer && "border-dashed")}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">{label}</p>
        {argument?.consistency_score != null && (
          <ConsistencyPill score={argument.consistency_score} />
        )}
      </CardHeader>
      <CardContent>
        {argument ? (
          <div className="space-y-3">
            <p className="text-sm leading-6">{argument.content}</p>
            {argument.consistency_critique && (
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {argument.consistency_critique}
              </p>
            )}
          </div>
        ) : composer ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void composer.onSubmit();
            }}
          >
            <textarea
              value={composer.draft}
              onChange={(event) => composer.setDraft(event.target.value)}
              rows={5}
              disabled={composer.busy}
              placeholder="Lock in this round’s argument…"
              className="min-h-32 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-950 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
            />
            <Button type="submit" size="sm" className="w-fit" disabled={composer.busy || !composer.draft.trim()}>
              {composer.busy ? "Locking in…" : "Lock In Argument"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-zinc-400">{emptyHint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SpectatorVote({
  candidateA,
  candidateB,
  votedCandidateId,
  votingFor,
  onVote,
}: {
  candidateA: DebateCandidate;
  candidateB: DebateCandidate;
  votedCandidateId: string | null | undefined;
  votingFor: "a" | "b" | null;
  onVote: (votedFor: "a" | "b") => void;
}) {
  const hasVoted = Boolean(votedCandidateId);
  const votedForA = votedCandidateId === candidateA.id;
  const votedForB = votedCandidateId === candidateB.id;
  const votedName = votedForA ? candidateA.username : votedForB ? candidateB.username : null;
  const submitting = votingFor !== null;

  return (
    <section className="mt-12">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Spectator vote
          </p>
          <CardTitle>Cast your ballot</CardTitle>
          <CardDescription>
            {hasVoted
              ? `You voted for ${votedName}. One ballot per spectator.`
              : "One vote per person. Your ballot locks after you cast it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              size="lg"
              variant={votedForA ? "default" : "outline"}
              disabled={submitting || hasVoted}
              aria-pressed={votedForA}
              onClick={() => onVote("a")}
            >
              {votingFor === "a"
                ? "Voting…"
                : votedForA
                  ? `Voted ${candidateA.username}`
                  : `Vote ${candidateA.username}`}
            </Button>
            <Button
              type="button"
              size="lg"
              variant={votedForB ? "default" : "outline"}
              disabled={submitting || hasVoted}
              aria-pressed={votedForB}
              onClick={() => onVote("b")}
            >
              {votingFor === "b"
                ? "Voting…"
                : votedForB
                  ? `Voted ${candidateB.username}`
                  : `Vote ${candidateB.username}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TallyBar({
  candidateA,
  candidateB,
  aVotes,
  bVotes,
  aShare,
  bShare,
  totalVotes,
}: {
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  aVotes: number;
  bVotes: number;
  aShare: number;
  bShare: number;
  totalVotes: number;
}) {
  const aWidth = totalVotes === 0 ? 50 : aShare;
  const bWidth = totalVotes === 0 ? 50 : bShare;

  return (
    <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Candidate A
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm font-medium">{candidateA?.username ?? "Candidate A"}</p>
            {candidateA ? <BackCandidateButton candidate={candidateA} /> : null}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{aShare}%</p>
          <p className="text-xs text-zinc-400">{aVotes} {aVotes === 1 ? "vote" : "votes"}</p>
        </div>
        <p className="pb-6 text-xs font-medium uppercase tracking-widest text-zinc-400">
          {totalVotes === 0 ? "No votes yet" : `${totalVotes} total`}
        </p>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Candidate B
          </p>
          <div className="mt-1 flex items-center justify-end gap-2">
            {candidateB ? <BackCandidateButton candidate={candidateB} /> : null}
            <p className="text-sm font-medium">{candidateB?.username ?? "Open seat"}</p>
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{bShare}%</p>
          <p className="text-xs text-zinc-400">{bVotes} {bVotes === 1 ? "vote" : "votes"}</p>
        </div>
      </div>
      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900"
        role="img"
        aria-label={`${candidateA?.username ?? "Candidate A"} ${aShare} percent, ${candidateB?.username ?? "Candidate B"} ${bShare} percent`}
      >
        <div
          className="h-full bg-zinc-950 transition-all duration-500 dark:bg-zinc-50"
          style={{ width: `${aWidth}%` }}
        />
        <div
          className="h-full bg-zinc-300 transition-all duration-500 dark:bg-zinc-700"
          style={{ width: `${bWidth}%` }}
        />
      </div>
    </section>
  );
}
