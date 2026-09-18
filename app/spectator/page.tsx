"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CandidateSeat } from "@/components/pledges/CandidateSeat";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getExpiryState, TOTAL_ROUNDS } from "@/lib/arena/time";
import { pickDebateWinnerId } from "@/lib/arena/winner";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";
import type {
  DebateCandidate,
  DebateWithCandidates,
  Vote,
} from "@/types/database.types";

type RankedDebate = DebateWithCandidates & {
  voteCount: number;
  aVotes: number;
  bVotes: number;
  aShare: number;
  bShare: number;
  winnerId: string | null;
};

function unwrapCandidate(
  value: DebateWithCandidates["candidate_a"],
): DebateCandidate | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function shareFor(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function candidateById(debate: RankedDebate, candidateId: string | null) {
  if (!candidateId) return null;
  const candidateA = unwrapCandidate(debate.candidate_a);
  const candidateB = unwrapCandidate(debate.candidate_b);
  if (candidateA?.id === candidateId) return candidateA;
  if (candidateB?.id === candidateId) return candidateB;
  return null;
}

async function resolveWinnerId(
  debate: DebateWithCandidates,
  votes: Pick<Vote, "candidate_id">[],
) {
  const { data, error } = await supabase.rpc("calculate_debate_winner", {
    debate_uuid: debate.id,
  });
  if (!error) return data ?? null;
  return pickDebateWinnerId(debate, votes);
}

export default function SpectatorPage() {
  const [trending, setTrending] = useState<RankedDebate[]>([]);
  const [completed, setCompleted] = useState<RankedDebate[]>([]);
  const [stage, setStage] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  async function loadFeed() {
    setError(null);

    const [{ data, error: debateError }, { data: voteRows, error: voteError }] = await Promise.all([
      supabase
        .from("debates")
        .select(
          `
          *,
          candidate_a:users!debates_candidate_a_id_fkey ( id, username ),
          candidate_b:users!debates_candidate_b_id_fkey ( id, username )
        `,
        )
        .order("created_at", { ascending: false }),
      supabase.from("votes").select("id, debate_id, candidate_id"),
    ]);

    if (debateError) {
      setError(debateError.message);
      setStage("error");
      return;
    }

    if (voteError) {
      setError(voteError.message);
      setStage("error");
      return;
    }

    const votesByDebate = new Map<string, Pick<Vote, "id" | "debate_id" | "candidate_id">[]>();
    for (const vote of (voteRows ?? []) as Pick<Vote, "id" | "debate_id" | "candidate_id">[]) {
      const list = votesByDebate.get(vote.debate_id) ?? [];
      list.push(vote);
      votesByDebate.set(vote.debate_id, list);
    }

    const ranked = ((data ?? []) as DebateWithCandidates[]).map((debate) => {
      const rows = votesByDebate.get(debate.id) ?? [];
      const aVotes = rows.filter((vote) => vote.candidate_id === debate.candidate_a_id).length;
      const bVotes = rows.filter((vote) => vote.candidate_id === debate.candidate_b_id).length;
      const voteCount = rows.length;
      const aShare = shareFor(aVotes, voteCount);
      return {
        ...debate,
        voteCount,
        aVotes,
        bVotes,
        aShare,
        bShare: voteCount === 0 ? 0 : 100 - aShare,
        winnerId: null as string | null,
      };
    });

    const live = ranked
      .filter((debate) => debate.status !== "completed")
      .sort((left, right) => {
        if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });

    const archived = ranked
      .filter((debate) => debate.status === "completed")
      .sort(
        (left, right) =>
          new Date(right.expires_at).getTime() - new Date(left.expires_at).getTime(),
      );

    const withWinners = await Promise.all(
      archived.map(async (debate) => ({
        ...debate,
        winnerId: await resolveWinnerId(debate, votesByDebate.get(debate.id) ?? []),
      })),
    );

    setTrending(live);
    setCompleted(withWinners);
    setStage("ready");
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  const hasDebates = trending.length > 0 || completed.length > 0;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Donor Feed
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Trending Debates</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Ranked by spectator ballots. Watch the floor, then lock in a vote.
          </p>
        </div>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/arena">Arena</Link>
        </Button>
      </div>

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Counting the room…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Could not load trending debates."}
          </p>
          <Button type="button" onClick={() => void loadFeed()}>
            Try again
          </Button>
        </section>
      )}

      {stage === "ready" && !hasDebates && (
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>No debates yet</CardTitle>
            <CardDescription>
              Open the arena, post a topic, and the first ballots will land here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stage === "ready" && hasDebates && (
        <>
          {trending.length === 0 ? (
            <Card className="mt-12">
              <CardHeader>
                <CardTitle>No live debates</CardTitle>
                <CardDescription>
                  The floor is quiet. Archived results are listed below.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <section className="mt-10 flex flex-col gap-3">
              {trending.map((debate, index) => (
                <TrendingCard key={debate.id} debate={debate} rank={index + 1} />
              ))}
            </section>
          )}

          <section className="mt-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
              Archive
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Completed Matches</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Expired debates with the final winner declared from the ballot count.
            </p>

            {completed.length === 0 ? (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>No archived matches yet</CardTitle>
                  <CardDescription>
                    When an active debate expires, the hourly job closes it and the winner lands here.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                {completed.map((debate) => (
                  <CompletedCard key={debate.id} debate={debate} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function TrendingCard({ debate, rank }: { debate: RankedDebate; rank: number }) {
  const candidateA = unwrapCandidate(debate.candidate_a);
  const candidateB = unwrapCandidate(debate.candidate_b);
  const expiry = getExpiryState(debate.expires_at);
  const aWidth = debate.voteCount === 0 ? 50 : debate.aShare;
  const bWidth = debate.voteCount === 0 ? 50 : debate.bShare;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>#{rank}</Badge>
          <Badge>{debate.status}</Badge>
          <Badge>
            Round {Math.min(debate.current_round, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
          </Badge>
          <Badge
            className={cn(
              expiry.tone === "expired" &&
                "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50",
              expiry.tone === "soon" && "border-amber-500 text-amber-700 dark:text-amber-400",
            )}
          >
            {expiry.label}
          </Badge>
        </div>
        <Link href={`/arena/${debate.id}`} className="block">
          <CardTitle className="text-lg leading-snug transition-colors hover:text-zinc-600 dark:hover:text-zinc-300">
            {debate.topic}
          </CardTitle>
        </Link>
        <SeatRow candidateA={candidateA} candidateB={candidateB} />
      </CardHeader>
      <CardContent className="space-y-3">
        <VoteBar debate={debate} candidateA={candidateA} candidateB={candidateB} aWidth={aWidth} bWidth={bWidth} />
      </CardContent>
    </Card>
  );
}

function CompletedCard({ debate }: { debate: RankedDebate }) {
  const candidateA = unwrapCandidate(debate.candidate_a);
  const candidateB = unwrapCandidate(debate.candidate_b);
  const winner = candidateById(debate, debate.winnerId);
  const aWidth = debate.voteCount === 0 ? 50 : debate.aShare;
  const bWidth = debate.voteCount === 0 ? 50 : debate.bShare;

  const resultLabel = winner
    ? `Winner: ${winner.username}`
    : debate.voteCount === 0
      ? "No ballots were cast"
      : "Draw — no winner declared";

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Completed</Badge>
          {winner ? (
            <Badge className="border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50">
              Winner declared
            </Badge>
          ) : (
            <Badge>{debate.voteCount === 0 ? "No contest" : "Draw"}</Badge>
          )}
        </div>
        <Link href={`/arena/${debate.id}`} className="block">
          <CardTitle className="text-lg leading-snug transition-colors hover:text-zinc-600 dark:hover:text-zinc-300">
            {debate.topic}
          </CardTitle>
        </Link>
        <SeatRow candidateA={candidateA} candidateB={candidateB} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{resultLabel}</p>
        <VoteBar debate={debate} candidateA={candidateA} candidateB={candidateB} aWidth={aWidth} bWidth={bWidth} />
      </CardContent>
    </Card>
  );
}

function SeatRow({
  candidateA,
  candidateB,
}: {
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <CandidateSeat candidate={candidateA} />
      <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">vs</span>
      <CandidateSeat candidate={candidateB} align="end" />
    </div>
  );
}

function VoteBar({
  debate,
  candidateA,
  candidateB,
  aWidth,
  bWidth,
}: {
  debate: RankedDebate;
  candidateA: DebateCandidate | null;
  candidateB: DebateCandidate | null;
  aWidth: number;
  bWidth: number;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium tabular-nums">
          {debate.voteCount} {debate.voteCount === 1 ? "vote" : "votes"}
        </p>
        <p className="text-xs tabular-nums text-zinc-400">
          {debate.aShare}% · {debate.bShare}%
        </p>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div
          className="h-full bg-zinc-950 transition-all duration-500 dark:bg-zinc-50"
          style={{ width: `${aWidth}%` }}
        />
        <div
          className="h-full bg-zinc-300 transition-all duration-500 dark:bg-zinc-700"
          style={{ width: `${bWidth}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{candidateA?.username ?? "Candidate A"}</span>
        <span>{candidateB?.username ?? "Candidate B"}</span>
      </div>
    </>
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
