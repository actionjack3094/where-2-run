"use client";

import { useOptimistic, useState } from "react";
import { useFormStatus } from "react-dom";
import { createComment } from "@/app/actions/comments";
import { ensureArenaUser } from "@/lib/arena/identity";
import { COMMENT_MAX_LENGTH } from "@/lib/comments";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CommentWithAuthor } from "@/types/database.types";

type OptimisticComment = CommentWithAuthor & { pending?: boolean };

function fallbackUsername() {
  if (typeof window === "undefined") return "You";
  return window.sessionStorage.getItem(STORAGE_KEYS.username)?.trim() || "You";
}

function formatCommentTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function CommentSubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" size="sm" className="w-fit" disabled={disabled || pending}>
      {pending ? "Posting…" : "Post comment"}
    </Button>
  );
}

export function CommentSection({
  debateId,
  comments,
}: {
  debateId: string;
  comments: CommentWithAuthor[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [optimisticComments, addOptimisticComment] = useOptimistic<
    OptimisticComment[],
    OptimisticComment
  >(comments, (current, next) => [...current, next]);

  async function submitComment(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;

    setError(null);
    addOptimisticComment({
      id: crypto.randomUUID(),
      debate_id: debateId,
      author_id: "pending",
      body,
      created_at: new Date().toISOString(),
      ai_stance_score: null,
      author: { id: "pending", username: fallbackUsername() },
      pending: true,
    });

    try {
      await ensureArenaUser();
      const { data: sessionData } = await supabase.auth.getSession();
      await createComment(debateId, body, sessionData.session?.access_token);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not post the comment.";
      setError(message);
      throw caught;
    }
  }

  return (
    <section className="mt-12 border-t border-gold/40 pt-8">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
        Public comments
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-parchment">
        District floor
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Spectators can weigh in under the debate. Stance grading lands later.
      </p>

      {optimisticComments.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No public comments yet. Open the floor.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {optimisticComments.map((comment) => (
            <li
              key={comment.id}
              className={cn(
                "rounded-lg border border-gold/30 bg-zinc-950 px-4 py-3",
                comment.pending && "opacity-70",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                  {comment.author?.username ?? "Citizen"}
                </p>
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  {comment.pending ? "Posting" : formatCommentTime(comment.created_at)}
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-200">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form action={submitComment} className="mt-6 flex flex-col gap-3">
        <label htmlFor="debate-comment" className="sr-only">
          Public comment
        </label>
        <textarea
          id="debate-comment"
          name="body"
          rows={4}
          required
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Add a public comment for this district debate."
          className="min-h-24 w-full resize-none rounded-lg border border-gold/40 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-gold"
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <CommentSubmitButton />
      </form>
    </section>
  );
}
