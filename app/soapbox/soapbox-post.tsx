"use client";

import { useState } from "react";
import Link from "next/link";
import { ChallengeModal } from "@/components/ChallengeModal";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { castSoapboxVote, type SoapboxPostView } from "@/lib/actions/soapbox";
import { formatCoordinate } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

function postedOn(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function SoapboxPost({
  post,
  viewerId,
}: {
  post: SoapboxPostView;
  viewerId: string | null;
}) {
  const [upvotes, setUpvotes] = useState(post.upvotes);
  const [downvotes, setDownvotes] = useState(post.downvotes);
  const [viewerVote, setViewerVote] = useState(post.viewerVote);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const mine = viewerId === post.authorId;
  const standing =
    post.civicStanding == null ? "—" : post.civicStanding.toLocaleString("en-US");
  const coordinate =
    post.ideologyX == null || post.ideologyY == null
      ? "Coordinate not filed"
      : formatCoordinate(post.ideologyX, post.ideologyY);

  async function vote(direction: 1 | -1) {
    if (!viewerId) {
      setVoteError("Sign in to vote.");
      return;
    }
    if (voting) return;
    setVoting(true);
    setVoteError(null);
    const result = await castSoapboxVote(post.id, direction);
    setVoting(false);
    if (result.error) {
      setVoteError(result.error);
      return;
    }
    setUpvotes(result.upvotes ?? upvotes);
    setDownvotes(result.downvotes ?? downvotes);
    setViewerVote(result.viewerVote ?? 0);
  }

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
      <div className="flex items-start gap-3">
        <CandidateAvatar name={post.name} avatarUrl={post.avatarUrl} size="md" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            {post.legalName ? "Legal name" : "Public name"}
          </p>
          <Link href={`/profile/${post.authorId}`} className="text-sm font-medium text-parchment hover:text-gold">
            {post.name}
          </Link>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Civic Standing
          </p>
          <p className="text-sm text-parchment">{standing}</p>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Ideology
          </p>
          <p className="text-sm text-parchment">{coordinate}</p>
        </div>
        <time className="ml-auto shrink-0 text-[11px] uppercase tracking-widest text-zinc-500" dateTime={post.createdAt}>
          {postedOn(post.createdAt)}
        </time>
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-200">{post.content}</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <VoteButton
          label="Upvote"
          count={upvotes}
          pressed={viewerVote === 1}
          disabled={voting}
          onClick={() => void vote(1)}
        />
        <VoteButton
          label="Downvote"
          count={downvotes}
          pressed={viewerVote === -1}
          disabled={voting}
          onClick={() => void vote(-1)}
        />
        <button
          type="button"
          disabled={mine}
          onClick={() => setChallengeOpen(true)}
          className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚔️ Challenge Stance
        </button>
      </div>
      {mine ? <p className="mt-2 text-xs text-zinc-500">You cannot challenge your own speech.</p> : null}
      {voteError ? <p className="mt-2 text-sm text-zinc-300">{voteError}</p> : null}

      <ChallengeModal
        open={challengeOpen}
        postId={post.id}
        authorId={post.authorId}
        authorName={post.name}
        onClose={() => setChallengeOpen(false)}
      />
    </article>
  );
}

function VoteButton({
  label,
  count,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
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
        "inline-flex h-10 items-center justify-center rounded-md border px-3 text-[11px] font-medium uppercase tracking-widest transition-colors disabled:opacity-60",
        pressed
          ? "border-gold bg-zinc-950 text-gold"
          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500",
      )}
    >
      {label}
      <span className="ml-2 tabular-nums">{count}</span>
    </button>
  );
}
