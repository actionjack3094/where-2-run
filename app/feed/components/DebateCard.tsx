"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimQuestionFloor } from "@/app/actions/feed/claim-floor";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { questionFloorMode } from "@/lib/feed/types";
import { SIX_AXIS_LABELS } from "@/lib/ideology/six-axis";
import { cn } from "@/lib/utils";
import type { BlueFeedDebate, RedFeedQuestion, SocialFeedItem } from "@/lib/feed/types";

function statusLabel(status: string) {
  if (status === "matching") return "Matching";
  if (status === "voting") return "Voting";
  if (status === "active") return "Active";
  return status;
}

export function DebateCard({ item }: { item: SocialFeedItem }) {
  if (item.loop === "red") return <CandidateQuestionCard item={item} />;
  return <JuryDebateCard item={item} />;
}

function CandidateQuestionCard({ item }: { item: RedFeedQuestion }) {
  const router = useRouter();
  const mode = questionFloorMode(item);
  const challenge = mode === "challenge";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opponent = item.waitingOpponentName ?? "An opponent";

  async function claimFloor() {
    if (pending || mode === "holding") return;
    setPending(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      await claimQuestionFloor(
        {
          questionId: item.id,
          debateId: challenge ? item.waitingDebateId : null,
        },
        data.session?.access_token ?? null,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this floor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-xl border border-red-500/40 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_#ef4444]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-red-300">
          {challenge ? "Opponent waiting" : "Open floor"}
        </span>
        <span className="rounded-full border border-red-500/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
          {item.jurisdictionalLevel}
        </span>
        <span className="rounded-full border border-red-500/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
          {SIX_AXIS_LABELS[item.primaryAxis]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {challenge
          ? `${opponent} is waiting on this question. Challenge them instead of starting a new thread.`
          : mode === "holding"
            ? "You have the floor. Waiting for an opponent to answer this thread."
            : "No one is waiting in your district. Take the floor to start a new thread."}
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-lg font-semibold leading-snug tracking-tight text-parchment">
          {item.prompt}
        </h2>
        {item.electionSlug ? (
          <Link
            href={`/elections/${item.electionSlug}`}
            className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-red-300 hover:text-red-200"
          >
            {item.districtName}
          </Link>
        ) : (
          <p className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-red-300">
            {item.districtName}
          </p>
        )}
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Information gain {item.informationGainScore.toFixed(2)}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          disabled={pending || mode === "holding"}
          onClick={() => void claimFloor()}
          className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-red-600 px-4 text-xs font-medium uppercase tracking-widest text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? challenge
              ? "Challenging…"
              : "Taking the floor…"
            : mode === "holding"
              ? "You have the floor"
              : challenge
                ? "CHALLENGE OPPONENT"
                : "TAKE THE FLOOR"}
        </button>
        {error ? (
          <p className="text-sm leading-6 text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function JuryDebateCard({ item }: { item: BlueFeedDebate }) {
  return (
    <article className="rounded-xl border border-blue-500/40 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_#3b82f6]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-blue-300">
          Jury
        </span>
        <span className="rounded-full border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
          {statusLabel(item.status)}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Link href={`/debates/${item.id}`} className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-parchment hover:text-blue-300">
            {item.title}
          </h2>
        </Link>
        {item.electionSlug ? (
          <Link
            href={`/elections/${item.electionSlug}`}
            className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-blue-300 hover:text-blue-200"
          >
            {item.districtName}
          </Link>
        ) : (
          <p className="shrink-0 text-[11px] font-medium uppercase tracking-widest text-blue-300">
            {item.districtName}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
        <span>{item.candidateA?.username ?? "Open seat"}</span>
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">vs</span>
        <span>{item.candidateB?.username ?? "Open seat"}</span>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          disabled
          className="inline-flex h-10 w-fit cursor-not-allowed items-center justify-center rounded-md border border-blue-500/30 px-4 text-xs font-medium uppercase tracking-widest text-zinc-500 opacity-50"
        >
          Take a Stance
        </button>
        <VoteForWinner item={item} />
      </div>
    </article>
  );
}

function VoteForWinner({ item }: { item: BlueFeedDebate }) {
  const [votingFor, setVotingFor] = useState<"a" | "b" | null>(null);
  const [votedFor, setVotedFor] = useState<"a" | "b" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seated = Boolean(item.candidateA && item.candidateB && item.votingOpen);

  async function vote(side: "a" | "b") {
    if (!seated || votingFor || votedFor) return;
    setVotingFor(side);
    setError(null);
    try {
      await ensureArenaUser();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/arena/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ match_id: item.id, voted_for: side }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not record the vote.");
      setVotedFor(side);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record the vote.");
    } finally {
      setVotingFor(null);
    }
  }

  return (
    <section className="rounded-lg border border-blue-500/30 bg-zinc-950/70 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-blue-300">
        Vote for Winner
      </p>
      {seated ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <WinnerButton
            label={item.candidateA?.username ?? "Candidate A"}
            pressed={votedFor === "a"}
            pending={votingFor === "a"}
            disabled={Boolean(votingFor || votedFor)}
            onClick={() => void vote("a")}
          />
          <WinnerButton
            label={item.candidateB?.username ?? "Candidate B"}
            pressed={votedFor === "b"}
            pending={votingFor === "b"}
            disabled={Boolean(votingFor || votedFor)}
            onClick={() => void vote("b")}
          />
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Waiting for both candidates before the jury can vote.
        </p>
      )}
      {error ? (
        <p className="mt-2 text-sm leading-6 text-blue-200" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function WinnerButton({
  label,
  pressed,
  pending,
  disabled,
  onClick,
}: {
  label: string;
  pressed: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md border px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? "border-blue-400 bg-blue-600 text-white"
          : "border-blue-500/40 bg-zinc-900 text-blue-100 hover:border-blue-400",
      )}
    >
      {pending ? "Voting…" : label}
    </button>
  );
}
