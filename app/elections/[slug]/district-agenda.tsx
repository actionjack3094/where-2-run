"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitCommunityPrompt, togglePromptUpvote } from "@/lib/actions/agenda";
import type { AgendaPrompt } from "@/lib/platform/agenda";
import { AGENDA_CONTENT_MAX, AGENDA_TITLE_MAX } from "@/lib/platform/agenda";

export function DistrictAgenda({
  primaryId,
  prompts,
  verified,
  signedIn,
  closed,
}: {
  primaryId: string;
  prompts: AgendaPrompt[];
  verified: boolean;
  signedIn: boolean;
  closed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mt-4 grid gap-4">
      {prompts.length === 0 ? (
        <p className="text-sm text-zinc-400">No issues filed for this primary yet.</p>
      ) : (
        prompts.map((prompt) => (
          <article key={prompt.id} className="rounded-xl border border-zinc-800 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium text-parchment">{prompt.title}</h3>
              <button
                type="button"
                disabled={closed || pendingId === prompt.id || !verified}
                onClick={() => {
                  if (!signedIn) {
                    setError("Sign in to upvote an issue.");
                    return;
                  }
                  if (!verified) {
                    setError("Stripe verification is required to upvote an issue.");
                    return;
                  }
                  setPendingId(prompt.id);
                  setError(null);
                  void togglePromptUpvote(prompt.id).then((result) => {
                    setPendingId(null);
                    if (result.error) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
                className="shrink-0 rounded-full border border-zinc-600 px-3 py-1 text-[11px] uppercase tracking-widest text-zinc-200 hover:border-gold hover:text-gold disabled:opacity-50"
              >
                {prompt.viewerUpvoted ? "Upvoted" : "Upvote"} {prompt.upvoteCount}
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{prompt.content}</p>
          </article>
        ))
      )}

      {error ? <p className="text-sm text-zinc-300">{error}</p> : null}
      {message ? <p className="text-sm text-parchment">{message}</p> : null}

      {closed ? (
        <p className="text-sm text-zinc-400">This primary has closed. The agenda is locked.</p>
      ) : !signedIn ? (
        <p className="text-sm text-zinc-400">
          <Link href="/auth/login" className="text-gold">
            Sign in
          </Link>{" "}
          to file or upvote an issue.
        </p>
      ) : !verified ? (
        <p className="text-sm text-zinc-400">
          <Link href="/verify" className="text-gold">
            Verify with Stripe
          </Link>{" "}
          to file or upvote an issue.
        </p>
      ) : (
        <form
          className="grid gap-3 rounded-xl border border-zinc-800 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (submitting) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            setSubmitting(true);
            setError(null);
            setMessage(null);
            void submitCommunityPrompt(
              primaryId,
              String(data.get("title") ?? ""),
              String(data.get("content") ?? ""),
            ).then((result) => {
              setSubmitting(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              form.reset();
              setMessage(result.message ?? "Issue filed.");
              router.refresh();
            });
          }}
        >
          <p className="text-[11px] uppercase tracking-widest text-zinc-500">Submit issue</p>
          <label className="grid gap-2 text-sm text-zinc-300">
            Title
            <input
              name="title"
              required
              maxLength={AGENDA_TITLE_MAX}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
            />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            Description
            <textarea
              name="content"
              required
              maxLength={AGENDA_CONTENT_MAX}
              rows={4}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="justify-self-start rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950 disabled:opacity-50"
          >
            {submitting ? "Filing…" : "Submit issue"}
          </button>
        </form>
      )}
    </div>
  );
}
