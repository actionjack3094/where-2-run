"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser, type ArenaUser } from "@/lib/arena/identity";
import { getExpiryState, TOTAL_ROUNDS } from "@/lib/arena/time";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";
import type {
  Argument,
  DebateCandidate,
  DebateWithCandidates,
  Vote,
} from "@/types/database.types";

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

export default function DebatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <DebateView debateId={id} />;
}

function DebateView({ debateId }: { debateId: string }) {
  const [debate, setDebate] = useState<DebateWithCandidates | null>(null);
  const [args, setArgs] = useState<Argument[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [user, setUser] = useState<ArenaUser | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

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

    const [{ data: argumentRows }, { data: voteRows }] = await Promise.all([
      supabase
        .from("arguments")
        .select("*")
        .eq("debate_id", debateId)
        .order("round_number")
        .order("created_at"),
      supabase.from("votes").select("*").eq("debate_id", debateId),
    ]);

    setDebate(data as DebateWithCandidates);
    setArgs(argumentRows ?? []);
    setVotes(voteRows ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
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
      window.clearInterval(interval);
    };
  }, [debateId]);

  const candidateA = unwrapCandidate(debate?.candidate_a ?? null);
  const candidateB = unwrapCandidate(debate?.candidate_b ?? null);
  const expiry = debate ? getExpiryState(debate.expires_at) : null;
  const isCandidateA = Boolean(user && debate && user.id === debate.candidate_a_id);
  const isCandidateB = Boolean(user && debate && user.id === debate.candidate_b_id);
  const isCandidate = isCandidateA || isCandidateB;
  const existingVote = user ? votes.find((vote) => vote.voter_id === user.id) : undefined;

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

  const canSpeak =
    Boolean(nextTurn) &&
    ((nextTurn?.side === "a" && isCandidateA) || (nextTurn?.side === "b" && isCandidateB));

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
    try {
      const actor = await withUser();
      const response = await fetch("/api/arena/arguments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debateId,
          authorId: actor.id,
          roundNumber: nextTurn.round,
          content: draft.trim(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not file the argument.");
      setDraft("");
      await loadDebate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not file the argument.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(candidateId: string) {
    setBusy(true);
    setActionError(null);
    try {
      const actor = await withUser();
      const response = await fetch("/api/arena/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debateId,
          voterId: actor.id,
          candidateId,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not record the vote.");
      await loadDebate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not record the vote.");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "loading") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <p className="text-sm text-zinc-500">Opening the floor…</p>
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
      <Link
        href="/arena"
        className="text-xs font-medium uppercase tracking-widest text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
      >
        ← Arena
      </Link>
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
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        {candidateA?.username ?? "Candidate A"} vs {candidateB?.username ?? "Open seat"}
      </p>

      {!debate.candidate_b_id && !isCandidateA && (
        <Button type="button" className="mt-6 w-fit" onClick={() => void handleJoin()} disabled={busy}>
          Enter as Candidate B
        </Button>
      )}

      {actionError && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{actionError}</p>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="flex flex-col gap-8">
          {Array.from({ length: TOTAL_ROUNDS }, (_, index) => {
            const round = index + 1;
            const aArg = findArgument(args, debate.candidate_a_id, round);
            const bArg = findArgument(args, debate.candidate_b_id, round);
            const showAComposer = canSpeak && nextTurn?.round === round && nextTurn.side === "a";
            const showBComposer = canSpeak && nextTurn?.round === round && nextTurn.side === "b";

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

        <VotingPanel
          candidateA={candidateA}
          candidateB={candidateB}
          aVotes={aVotes}
          bVotes={bVotes}
          aShare={aShare}
          bShare={bShare}
          canVote={Boolean(debate.candidate_a_id && debate.candidate_b_id) && !isCandidate}
          existingVote={existingVote}
          busy={busy}
          onVote={(candidateId) => void handleVote(candidateId)}
        />
      </div>
    </main>
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
              placeholder="File this round’s argument…"
              className="resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
            />
            <Button type="submit" size="sm" className="w-fit" disabled={composer.busy || !composer.draft.trim()}>
              {composer.busy ? "Filing…" : "File argument"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-zinc-400">{emptyHint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function VotingPanel({
  candidateA,
  candidateB,
  aVotes,
  bVotes,
  aShare,
  bShare,
  canVote,
  existingVote,
  busy,
  onVote,
}: {
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  aVotes: number;
  bVotes: number;
  aShare: number;
  bShare: number;
  canVote: boolean;
  existingVote?: Vote;
  busy: boolean;
  onVote: (candidateId: string) => void;
}) {
  const votedForA = existingVote && existingVote.candidate_id === candidateA?.id;
  const votedForB = existingVote && existingVote.candidate_id === candidateB?.id;

  return (
    <aside className="lg:sticky lg:top-8 h-fit">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Spectators
          </p>
          <CardTitle>Live tally</CardTitle>
          <CardDescription>
            {aVotes + bVotes === 0 ? "No votes yet." : `${aVotes + bVotes} votes in.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <TallyRow
            name={candidateA?.username ?? "Candidate A"}
            votes={aVotes}
            share={aShare}
          />
          <TallyRow
            name={candidateB?.username ?? "Candidate B"}
            votes={bVotes}
            share={bShare}
          />
          {canVote && candidateA && candidateB && (
            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                variant={votedForA ? "default" : "outline"}
                disabled={busy || Boolean(existingVote)}
                onClick={() => onVote(candidateA.id)}
              >
                {votedForA ? "Voted A" : `Vote ${candidateA.username}`}
              </Button>
              <Button
                type="button"
                variant={votedForB ? "default" : "outline"}
                disabled={busy || Boolean(existingVote)}
                onClick={() => onVote(candidateB.id)}
              >
                {votedForB ? "Voted B" : `Vote ${candidateB.username}`}
              </Button>
            </div>
          )}
          {!canVote && !candidateB && (
            <p className="text-xs leading-5 text-zinc-400">
              Voting opens once a challenger takes the second lectern.
            </p>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

function TallyRow({
  name,
  votes,
  share,
}: {
  name: string;
  votes: number;
  share: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs tabular-nums text-zinc-400">
          {votes} · {share}%
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div
          className="h-full bg-zinc-950 transition-all duration-500 dark:bg-zinc-50"
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}
