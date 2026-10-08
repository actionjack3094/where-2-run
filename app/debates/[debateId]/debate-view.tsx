"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { gradeDebate } from "@/app/actions/arbitration/grade-debate";
import { CIVIC_FENCE_BALLOT_NOTICE } from "@/lib/civic-fencing";
import { AppealModal } from "@/components/debates/AppealModal";
import { CommentSection } from "@/components/comments/CommentSection";
import { BackCandidateButton } from "@/components/pledges/BackCandidateButton";
import { CandidateSeat } from "@/components/pledges/CandidateSeat";
import { DebatePledgeProvider, PledgeError } from "@/components/pledges/DebatePledgeContext";
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
import { displayTally, formatWeightedSubtitle } from "@/lib/vote-weight";
import { getExpiryState, TOTAL_ROUNDS } from "@/lib/arena/time";
import { ROUND_CHAR_LIMIT, roundLabel } from "@/lib/debates/structure";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import {
  ELECTION_LINK_COLUMNS,
  resolveElectionLink,
  type ElectionLinkRow,
} from "@/lib/election-links";
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

/** First seat without an argument, in round order; null once every round is filled. */
function findNextTurn(args: Argument[], debate: DebateWithCandidates | null) {
  if (!debate) return null;
  for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
    const aArg = findArgument(args, debate.candidate_a_id, round);
    if (!aArg) return { side: "a" as const, round };
    const bArg = findArgument(args, debate.candidate_b_id, round);
    if (!bArg) return { side: "b" as const, round };
  }
  return null;
}

function asArgument(value: unknown): Argument | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Argument;
  if (
    typeof row.id !== "string" ||
    typeof row.debate_id !== "string" ||
    typeof row.author_id !== "string" ||
    typeof row.round_number !== "number" ||
    typeof row.content !== "string"
  ) {
    return null;
  }
  return row;
}

function mergeArgument(current: Argument[], incoming: Argument): Argument[] {
  const index = current.findIndex((entry) => entry.id === incoming.id);
  const next =
    index === -1
      ? [...current, incoming]
      : current.map((entry, position) =>
          position === index ? { ...entry, ...incoming } : entry,
        );
  return next.sort((left, right) => {
    if (left.round_number !== right.round_number) return left.round_number - right.round_number;
    return left.created_at.localeCompare(right.created_at);
  });
}

function patchDebate(
  current: DebateWithCandidates,
  row: Record<string, unknown>,
): DebateWithCandidates {
  const next = { ...current };
  if (typeof row.status === "string") next.status = row.status;
  if (typeof row.current_round === "number") next.current_round = row.current_round;
  if (typeof row.expires_at === "string") next.expires_at = row.expires_at;
  if (typeof row.candidate_a_argument === "string" || row.candidate_a_argument === null) {
    next.candidate_a_argument = row.candidate_a_argument;
  }
  if (typeof row.candidate_b_argument === "string" || row.candidate_b_argument === null) {
    next.candidate_b_argument = row.candidate_b_argument;
  }
  if (typeof row.winner_id === "string" || row.winner_id === null) next.winner_id = row.winner_id;
  if (typeof row.candidate_a_votes === "number") next.candidate_a_votes = row.candidate_a_votes;
  if (typeof row.candidate_b_votes === "number") next.candidate_b_votes = row.candidate_b_votes;
  return next;
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
  votingOpen = false,
}: {
  debateId: string;
  comments: CommentWithAuthor[];
  votingOpen?: boolean;
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
  const [electionSlug, setElectionSlug] = useState<string | null>(null);
  const [electionId, setElectionId] = useState<string | null>(null);
  const voteLockRef = useRef(false);
  const graderWaitRef = useRef(0);
  const judgeRequestRef = useRef(0);

  const loadDebate = useCallback(async () => {
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
    setArgs((current) =>
      (argumentRows ?? []).reduce(
        (rows, incoming) => mergeArgument(rows, incoming as Argument),
        current.filter((row) => row.debate_id === debateId),
      ),
    );
    setVotes(voteRows ?? []);
    if (!evaluationsResult.error) {
      setEvaluations((evaluationsResult.data ?? []) as DebateEvaluation[]);
    }

    const { data: electionRows } = await supabase
      .from("elections")
      .select(ELECTION_LINK_COLUMNS);
    const race = resolveElectionLink((electionRows ?? []) as ElectionLinkRow[], {
      electionId: (data as DebateWithCandidates).election_id,
      districtId: (data as DebateWithCandidates).district_id,
    });
    setElectionSlug(race?.slug ?? null);
    setElectionId(race?.id ?? null);
  }, [debateId]);

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

    return () => {
      cancelled = true;
      graderWaitRef.current += 1;
    };
  }, [debateId, loadDebate]);

  useEffect(() => {
    let active = true;

    function appendArgument(row: Argument) {
      if (!active || row.debate_id !== debateId) return;
      setArgs((current) => mergeArgument(current, row));
    }

    function applyDebateUpdate(row: Record<string, unknown>) {
      if (!active || row.id !== debateId) return;
      setDebate((current) => (current ? patchDebate(current, row) : current));
    }

    const channel = supabase
      .channel(`live-debate:${debateId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "arguments",
          filter: `debate_id=eq.${debateId}`,
        },
        (payload) => {
          const row = asArgument(payload.new);
          if (row) appendArgument(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "arguments",
          filter: `debate_id=eq.${debateId}`,
        },
        (payload) => {
          const row = asArgument(payload.new);
          if (row) appendArgument(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "debates",
          filter: `id=eq.${debateId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            applyDebateUpdate(payload.new as Record<string, unknown>);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void loadDebate().catch(() => undefined);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [debateId, loadDebate]);

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
  const votingPhase = votingOpen || debate?.status === "voting";
  const bothSeated = Boolean(debate?.candidate_a_id && debate?.candidate_b_id);
  const showVoteButtons = Boolean(
    bothSeated &&
      (votingPhase ||
        ((ALLOW_CANDIDATE_DEBUG_VOTES || !isCandidate) && isVotableStatus)),
  );

  const nextTurn = findNextTurn(args, debate);

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
    (debate?.status === "voting" ||
      debate?.status === "completed" ||
      debate?.status === "resolved");

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

  // Weighted totals are stored when the debate resolves; until then (and for
  // debates resolved before weights existed) the live raw ballots lead.
  const weightedTotals =
    debate?.status === "completed" || debate?.status === "resolved"
      ? { a: debate.candidate_a_weighted_votes ?? 0, b: debate.candidate_b_weighted_votes ?? 0 }
      : null;
  const liveRaw = {
    a: votes.filter((vote) => vote.candidate_id === debate?.candidate_a_id).length,
    b: votes.filter((vote) => vote.candidate_id === debate?.candidate_b_id).length,
  };
  const tally = displayTally(
    weightedTotals && weightedTotals.a + weightedTotals.b > 0
      ? { a: debate?.candidate_a_votes ?? 0, b: debate?.candidate_b_votes ?? 0 }
      : liveRaw,
    weightedTotals,
  );
  const aVotes = tally.primary.a;
  const bVotes = tally.primary.b;
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
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <p className="text-sm text-stone-600">Opening the floor…</p>
        <CommentSection debateId={debateId} comments={comments} />
      </div>
    );
  }

  if (stage === "error" || !debate) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <p className="text-sm text-stone-600 ">{error ?? "Debate not found."}</p>
        <Button asChild variant="ghost" className="mt-4 w-fit">
          <Link href="/feed">Back to Feed</Link>
        </Button>
      </div>
    );
  }

  return (
    <DebatePledgeProvider electionId={electionId} donorId={user?.id ?? null}>
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={electionSlug ? `/elections/district/${electionSlug}/profile` : "/feed"}
          className="text-xs font-medium uppercase tracking-widest text-stone-600 hover:text-stone-900 "
        >
          {electionSlug ? "← Race profile" : "← Feed"}
        </Link>
        <Link
          href="/spectator"
          className="text-xs font-medium uppercase tracking-widest text-stone-600 hover:text-stone-900 "
        >
          Donor Feed
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge>
          {roundLabel(Math.min(debate.current_round, TOTAL_ROUNDS))} · {Math.min(debate.current_round, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
        </Badge>
        {expiry && (
          <Badge
            className={cn(
              expiry.tone === "expired" && "border-stone-900 text-stone-900  ",
              expiry.tone === "soon" && "border-amber-500 text-amber-700 ",
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
        <PledgeError />
      </div>

      {!debate.candidate_b_id && !isCandidateA && (
        <Button type="button" className="mt-6 w-fit" onClick={() => void handleJoin()} disabled={busy}>
          Enter as Candidate B
        </Button>
      )}

      {actionError && (
        <p className="mt-4 text-sm text-stone-600 ">{actionError}</p>
      )}

      <section className="mt-10 flex h-[60vh] flex-col gap-8 overflow-y-auto">
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
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">
                {roundLabel(round)}
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
        <p className="mt-10 text-sm text-stone-600 ">
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
        weighted={tally.weighted}
        raw={tally.raw}
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
      {appealOpen && appealUnlocked && myEvaluation && (
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
    </div>
    </DebatePledgeProvider>
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
          <p className="text-xs font-medium uppercase tracking-widest text-stone-600">
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
            <p className="text-sm text-stone-600 ">{judgeError}</p>
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
    <div className="rounded-lg border border-stone-200 px-3 py-3 ">
      <p className="text-xs font-medium uppercase tracking-widest text-stone-600">{label}</p>
      {evaluation ? (
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-600">Score</dt>
            <dd className="tabular-nums">{parseScore(evaluation.primary_score).toFixed(1)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-600">Confidence</dt>
            <dd className="tabular-nums">
              {parseScore(evaluation.confidence_score).toFixed(2)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-600">Flag</dt>
            <dd>{evaluation.rubric_flag?.replace(/_/g, " ") ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-600">Court</dt>
            <dd>
              {evaluation.status === "locked"
                ? evaluation.ensemble_result
                  ? "Pass · Civic Standing locked"
                  : "Fail · Civic Standing locked"
                : evaluation.status}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-stone-600">Awaiting verdict</p>
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
          "rounded-full border border-stone-200 bg-white px-4 py-2 text-sm shadow-lg  ",
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
        "rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-stone-600  ",
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
          nameClassName="text-sm font-medium text-stone-900 "
        />
        {simulateSide === "a" && (
          <SimulateOpponentButton busy={simulateBusy} onSimulate={onSimulate} />
        )}
      </div>
      <span className="text-[11px] font-medium uppercase tracking-widest text-stone-600">vs</span>
      <div className="flex items-center gap-2">
        {simulateSide === "b" && (
          <SimulateOpponentButton busy={simulateBusy} onSimulate={onSimulate} />
        )}
        <CandidateSeat
          candidate={candidateB}
          align="end"
          emptyLabel="Open seat"
          nameClassName="text-sm font-medium text-stone-900 "
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
          ? "bg-amber-800 text-stone-50  "
          : score >= 70
            ? "bg-stone-200 text-stone-800  "
            : "border border-stone-300 text-stone-600 ",
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
        <p className="text-xs font-medium uppercase tracking-widest text-stone-600">{label}</p>
        {argument?.consistency_score != null && (
          <ConsistencyPill score={argument.consistency_score} />
        )}
      </CardHeader>
      <CardContent>
        {argument ? (
          <div className="space-y-3">
            <p className="text-sm leading-6">{argument.content}</p>
            {argument.consistency_critique && (
              <p className="text-xs leading-5 text-stone-600 ">
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
              onChange={(event) => composer.setDraft(event.target.value.slice(0, ROUND_CHAR_LIMIT))}
              maxLength={ROUND_CHAR_LIMIT}
              rows={5}
              disabled={composer.busy}
              placeholder="Lock in this round’s argument…"
              className="min-h-32 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-amber-700 disabled:opacity-60   "
            />
            <Button
              type="submit"
              size="sm"
              className="w-fit transition-colors duration-200 hover:bg-stone-100"
              disabled={composer.busy || !composer.draft.trim()}
            >
              {composer.busy ? "Locking in…" : "Lock In Argument"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-stone-600">{emptyHint}</p>
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
          <p className="text-xs font-medium uppercase tracking-widest text-stone-600">
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
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm leading-6 text-amber-800">
            <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{CIVIC_FENCE_BALLOT_NOTICE}</span>
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button
              type="button"
              size="lg"
              variant={votedForA ? "default" : "outline"}
              className="flex-1 transition-colors duration-200 hover:bg-stone-100"
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
              className="flex-1 transition-colors duration-200 hover:bg-stone-100"
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
  weighted,
  raw,
}: {
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  /** Weighted totals when `weighted`, else raw ballots. */
  aVotes: number;
  bVotes: number;
  aShare: number;
  bShare: number;
  totalVotes: number;
  weighted: boolean;
  raw: { a: number; b: number };
}) {
  const unit = (count: number) =>
    weighted ? "weighted votes" : count === 1 ? "vote" : "votes";
  const aWidth = totalVotes === 0 ? 50 : aShare;
  const bWidth = totalVotes === 0 ? 50 : bShare;

  return (
    <section className="mt-12 border-t border-stone-200 pt-8 ">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-stone-600">
            Candidate A
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm font-medium">{candidateA?.username ?? "Candidate A"}</p>
            {candidateA ? <BackCandidateButton candidate={candidateA} /> : null}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{aShare}%</p>
          <p className="text-xs text-stone-600">{aVotes} {unit(aVotes)}</p>
        </div>
        <p className="pb-6 text-xs font-medium uppercase tracking-widest text-stone-600">
          {totalVotes === 0 ? "No votes yet" : `${totalVotes}${weighted ? "w" : ""} total`}
        </p>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-widest text-stone-600">
            Candidate B
          </p>
          <div className="mt-1 flex items-center justify-end gap-2">
            {candidateB ? <BackCandidateButton candidate={candidateB} /> : null}
            <p className="text-sm font-medium">{candidateB?.username ?? "Open seat"}</p>
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{bShare}%</p>
          <p className="text-xs text-stone-600">{bVotes} {unit(bVotes)}</p>
        </div>
      </div>
      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-stone-100 "
        role="img"
        aria-label={`${candidateA?.username ?? "Candidate A"} ${aShare} percent, ${candidateB?.username ?? "Candidate B"} ${bShare} percent${weighted ? " of weighted votes" : ""}`}
      >
        <div
          className="h-full bg-white transition-all duration-500 "
          style={{ width: `${aWidth}%` }}
        />
        <div
          className="h-full bg-stone-300 transition-all duration-500 "
          style={{ width: `${bWidth}%` }}
        />
      </div>
      {weighted ? (
        <p className="mt-3 text-center text-xs tabular-nums text-stone-600">
          {formatWeightedSubtitle(raw, { a: aVotes, b: bVotes })}
          <span className="sr-only">. Verified constituents count 3 votes each.</span>
        </p>
      ) : null}
      <PledgeError className="mt-3 text-xs text-rose-300" />
    </section>
  );
}
