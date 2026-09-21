"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";

const LIKES_KEY = "where2run.feedLikes";

type CandidatePreview = { id: string; username: string } | null;

function readLikedIds() {
  try {
    const raw = window.localStorage.getItem(LIKES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function VoterPostActions({
  debateId,
  candidateA,
  candidateB,
  votingOpen,
}: {
  debateId: string;
  candidateA: CandidatePreview;
  candidateB: CandidatePreview;
  votingOpen: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<string[]>([]);
  const [votingFor, setVotingFor] = useState<"a" | "b" | null>(null);
  const [votedFor, setVotedFor] = useState<"a" | "b" | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    setLiked(readLikedIds().includes(debateId));
  }, [debateId]);

  function toggleLike() {
    const nextLiked = !liked;
    setLiked(nextLiked);
    const ids = new Set(readLikedIds());
    if (nextLiked) ids.add(debateId);
    else ids.delete(debateId);
    window.localStorage.setItem(LIKES_KEY, JSON.stringify([...ids]));
  }

  function submitComment(event: React.FormEvent) {
    event.preventDefault();
    const next = comment.trim();
    if (!next) return;
    setComments((current) => [...current, next]);
    setComment("");
    setCommentOpen(false);
  }

  async function handleVote(side: "a" | "b") {
    if (votingFor || votedFor || !votingOpen) return;
    setVotingFor(side);
    setVoteError(null);
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
        body: JSON.stringify({ match_id: debateId, voted_for: side }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not record the vote.");
      }
      setVotedFor(side);
    } catch (caught) {
      setVoteError(caught instanceof Error ? caught.message : "Could not record the vote.");
    } finally {
      setVotingFor(null);
    }
  }

  const canVote = votingOpen && Boolean(candidateA && candidateB);

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={liked}
          onClick={toggleLike}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium uppercase tracking-widest transition-colors",
            liked
              ? "border-accent bg-accent text-accent-foreground"
              : "border-accent/50 bg-zinc-800 text-parchment hover:border-accent hover:bg-zinc-700",
          )}
        >
          {liked ? "Liked" : "Like"}
        </button>
        <button
          type="button"
          aria-expanded={commentOpen}
          onClick={() => setCommentOpen((open) => !open)}
          className="inline-flex h-9 items-center justify-center rounded-md border border-accent/50 bg-zinc-800 px-3 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-accent hover:bg-zinc-700"
        >
          Comment
        </button>
        {canVote ? (
          <>
            <button
              type="button"
              onClick={() => void handleVote("a")}
              disabled={Boolean(votingFor || votedFor)}
              aria-pressed={votedFor === "a"}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                votedFor === "a"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-accent/50 bg-zinc-800 text-parchment hover:border-accent hover:bg-zinc-700",
              )}
            >
              {votingFor === "a" ? "Voting…" : `Vote ${candidateA?.username ?? "A"}`}
            </button>
            <button
              type="button"
              onClick={() => void handleVote("b")}
              disabled={Boolean(votingFor || votedFor)}
              aria-pressed={votedFor === "b"}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                votedFor === "b"
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-accent/50 bg-zinc-800 text-parchment hover:border-accent hover:bg-zinc-700",
              )}
            >
              {votingFor === "b" ? "Voting…" : `Vote ${candidateB?.username ?? "B"}`}
            </button>
          </>
        ) : (
          <Link
            href={`/arena/${debateId}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-accent/50 bg-zinc-800 px-3 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-accent hover:bg-zinc-700"
          >
            Watch debate
          </Link>
        )}
      </div>

      {voteError ? <p className="text-xs text-red-300">{voteError}</p> : null}

      {commentOpen ? (
        <form className="flex flex-col gap-2" onSubmit={submitComment}>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            autoFocus
            placeholder="Add a public note for this district debate."
            className="resize-none rounded-md border border-accent/40 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-[11px] font-medium uppercase tracking-widest text-accent-foreground"
            >
              Post comment
            </button>
            <button
              type="button"
              onClick={() => setCommentOpen(false)}
              className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-700 px-3 text-[11px] font-medium uppercase tracking-widest text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {comments.length > 0 ? (
        <ul className="flex flex-col gap-2 border-t border-accent/20 pt-3">
          {comments.map((entry, index) => (
            <li key={`${entry}-${index}`} className="text-sm leading-6 text-zinc-300">
              {entry}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
