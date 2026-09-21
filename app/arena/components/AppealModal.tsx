"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { executeAppeal } from "@/app/actions/ai/execute-appeal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ADDENDUM_WORD_LIMIT,
  canFileAddendum,
  countWords,
} from "@/lib/arena/evaluations";
import { supabase } from "@/lib/db/supabase";
import type { DebateEvaluation } from "@/types/database.types";

export function AppealModal({
  evaluation,
  onClose,
  onSettled,
}: {
  evaluation: DebateEvaluation;
  onClose: () => void;
  onSettled: (evaluation: DebateEvaluation) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(evaluation.addendum_text ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unlocked = canFileAddendum(evaluation);
  const wordCount = useMemo(() => countWords(draft), [draft]);
  const overLimit = wordCount > ADDENDUM_WORD_LIMIT;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !unlocked) return;
    if (wordCount === 0) {
      setFormError("Clarify the flagged rubric item before filing.");
      return;
    }
    if (overLimit) {
      setFormError(`Addenda are capped at ${ADDENDUM_WORD_LIMIT} words.`);
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const result = await executeAppeal({
        evaluationId: evaluation.id,
        addendumText: draft.trim(),
        accessToken: sessionData.session?.access_token,
      });
      onSettled(result.evaluation);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "The Ensemble Court could not hear this appeal.",
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Ensemble Court
          </p>
          <CardTitle id={titleId}>Clarify the rubric flag</CardTitle>
          <CardDescription>
            Marginal confidence ({Number(evaluation.confidence_score).toFixed(2)}) unlocked a
            strict {ADDENDUM_WORD_LIMIT}-word addendum on{" "}
            <span className="font-medium text-zinc-200">
              {evaluation.rubric_flag?.replace(/_/g, " ") ?? "the flagged item"}
            </span>
            . Three models vote pass or fail; majority (3–0 or 2–1) locks your ELO.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                Addendum
              </span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={7}
                disabled={busy || !unlocked}
                placeholder="Address only the flagged criterion. No new topics."
                className="min-h-36 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-950 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-50"
              />
              <span
                className={
                  overLimit
                    ? "text-xs text-amber-600 dark:text-amber-400"
                    : "text-xs text-zinc-500"
                }
              >
                {wordCount} / {ADDENDUM_WORD_LIMIT} words
              </span>
            </label>

            {formError && <p className="text-sm text-zinc-600 dark:text-zinc-300">{formError}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={busy || !unlocked || wordCount === 0 || overLimit}
              >
                {busy ? "Convening the court…" : "File addendum"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
