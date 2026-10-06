"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileGauntletStance } from "@/lib/actions/gauntlet";
import { ROUND_CHAR_LIMIT } from "@/lib/debates/structure";

export function DistrictGauntletForm({
  primaryId,
  office,
  prompts,
}: {
  primaryId: string;
  office: string;
  prompts: { id: string; title: string; content: string; filed: string | null }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mt-8 rounded-xl border border-amber-500/30 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">The District Gauntlet</p>
      <h2 className="mt-2 font-display text-2xl text-parchment">{office}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        You are unopposed inside 45 days of the filing deadline. File a formal stance on each of
        the top three queued issues. Each stance is {ROUND_CHAR_LIMIT} characters at most.
      </p>
      <div className="mt-5 grid gap-5">
        {prompts.map((prompt) => (
          <form
            key={prompt.id}
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const content = String(new FormData(event.currentTarget).get("content") ?? "");
              setPending(prompt.id);
              setError(null);
              void fileGauntletStance(primaryId, prompt.id, content).then((result) => {
                setPending(null);
                if (result.error) setError(result.error);
                else router.refresh();
              });
            }}
          >
            <p className="text-sm font-medium text-parchment">{prompt.title}</p>
            <p className="text-sm leading-6 text-zinc-400">{prompt.content}</p>
            <textarea
              name="content"
              required
              minLength={20}
              maxLength={ROUND_CHAR_LIMIT}
              rows={4}
              defaultValue={prompt.filed ?? ""}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
            />
            <button
              type="submit"
              disabled={pending != null}
              className="justify-self-start rounded-md bg-gold-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-950 disabled:opacity-50"
            >
              {prompt.filed ? "Update stance" : pending === prompt.id ? "Filing…" : "File stance"}
            </button>
          </form>
        ))}
      </div>
      {prompts.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">The Agenda Queue has no issues for this race yet.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-zinc-300">{error}</p> : null}
    </section>
  );
}
