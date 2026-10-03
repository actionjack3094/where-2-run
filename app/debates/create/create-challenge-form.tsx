"use client";

import { useState } from "react";
import { createPrimaryDebatePrompt } from "@/lib/actions/debates";
import type { AgendaPrompt } from "@/lib/platform/agenda";

export function CreateChallengeForm({
  primaryId,
  prompts,
  allowSpar,
  sparMinutes,
}: {
  primaryId: string;
  prompts: AgendaPrompt[];
  allowSpar: boolean;
  sparMinutes: number | null;
}) {
  const [sourceId, setSourceId] = useState(prompts[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (prompts.length === 0) {
    return <p className="mt-6 text-sm text-zinc-400">No district issues are ready to debate yet.</p>;
  }

  return (
    <form
      className="mt-6 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !sourceId) return;
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        setMessage(null);
        void createPrimaryDebatePrompt(
          primaryId,
          "",
          String(data.get("stance") ?? ""),
          data.get("sparWithAi") === "on",
          sourceId,
        ).then((result) => {
          setPending(false);
          if (result.error) {
            setError(result.error);
            return;
          }
          setMessage(result.message ?? "Your opening stance is on the board.");
        });
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="text-[11px] uppercase tracking-widest text-zinc-500">District issue</legend>
        {prompts.map((prompt) => (
          <label
            key={prompt.id}
            className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-zinc-800 px-4 py-3 text-sm"
          >
            <input
              type="radio"
              name="sourcePromptId"
              value={prompt.id}
              checked={sourceId === prompt.id}
              onChange={() => setSourceId(prompt.id)}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-parchment">{prompt.title}</span>
              <span className="mt-1 block text-zinc-500">{prompt.upvoteCount} upvotes</span>
              <span className="mt-2 block leading-6 text-zinc-300">{prompt.content}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="grid gap-2 text-sm text-zinc-300">
        Opening stance
        <textarea
          name="stance"
          required
          minLength={20}
          rows={5}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
        />
      </label>
      {allowSpar && sparMinutes != null ? (
        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="sparWithAi" className="mt-1" />
          <span>
            Spar with AI
            <span className="mt-1 block text-zinc-500">
              A same-party partner answers immediately. Leave this off and a partner engages after {sparMinutes}{" "}
              minutes if nobody accepts.
            </span>
          </span>
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending || !sourceId}
        className="justify-self-start rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-950 disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post question"}
      </button>
      {error ? <p className="text-sm text-zinc-300">{error}</p> : null}
      {message ? <p className="text-sm text-parchment">{message}</p> : null}
    </form>
  );
}
