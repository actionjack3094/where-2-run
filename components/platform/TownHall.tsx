"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InfoTooltip, TOWN_HALL_TIP } from "@/components/InfoTooltip";
import { submitCandidateAnswer, submitConstituentQuestion } from "@/app/lib/actions/qa";
import { QUESTION_MAX, type TownHallQuestion } from "@/lib/platform/town-hall";

export function TownHall({
  debateId,
  questions,
  viewerId,
  verified,
  candidateAId,
  candidateBId,
}: {
  debateId: string;
  questions: TownHallQuestion[];
  viewerId: string | null;
  verified: boolean;
  candidateAId: string;
  candidateBId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const seated = viewerId != null && (viewerId === candidateAId || viewerId === candidateBId);
  const alreadyAsked = viewerId != null && questions.some((question) => question.voterId === viewerId);
  const canAsk = verified && viewerId != null && !seated && !alreadyAsked;
  const canReply = seated;

  function file(task: Promise<{ error?: string }>, onDone?: () => void) {
    if (pending) return;
    setPending(true);
    setError(null);
    void task
      .then((result) => {
        setPending(false);
        if (result.error) {
          setError(result.error);
          return;
        }
        onDone?.();
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Could not file that. Try again.");
      });
  }

  return (
    <section className="mt-5 border-t border-amber-500/30 pt-4">
      <h3 className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-600">
        Q&A
        <InfoTooltip label="Town Hall Q&A" text={TOWN_HALL_TIP} />
      </h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Verified voters ask one question. The two candidates reply. Voters do not reply to each other.
      </p>
      {questions.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600">No questions yet.</p>
      ) : (
        <ul className="mt-3 grid gap-4">
          {questions.map((question) => {
            const answered = question.answers.some((answer) => answer.candidateId === viewerId);
            return (
              <li key={question.id}>
                <p className="text-sm leading-6 text-stone-600">
                  <span className="font-medium text-stone-900">{question.voterName}. </span>
                  {question.content}
                </p>
                {question.answers.length > 0 ? (
                  <ul className="mt-2 grid gap-2 border-l border-amber-500/30 pl-3">
                    {question.answers.map((answer) => (
                      <li key={answer.id} className="text-sm leading-6 text-stone-600">
                        <span className="font-medium text-amber-800">{answer.candidateName}. </span>
                        {answer.content}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canReply && !answered ? (
                  <form
                    className="mt-2 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const content = String(new FormData(form).get("answer") ?? "");
                      file(submitCandidateAnswer(question.id, content), () => form.reset());
                    }}
                  >
                    <label className="grid gap-2 text-sm text-stone-600">
                      Reply
                      <textarea
                        name="answer"
                        required
                        rows={3}
                        className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-sm text-stone-900"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={pending}
                      className="justify-self-start rounded-md bg-gold-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-50"
                    >
                      {pending ? "Sending…" : "Send reply"}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {error ? <p className="mt-3 text-sm text-stone-600">{error}</p> : null}
      {canAsk ? (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            file(submitConstituentQuestion(debateId, draft), () => {
              form.reset();
              setDraft("");
            });
          }}
        >
          <label className="grid gap-2 text-sm text-stone-600">
            Ask a question
            <textarea
              name="question"
              required
              maxLength={QUESTION_MAX}
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              className="rounded-md border border-amber-500/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-stone-700 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Ask a question"}
            </button>
            <span className="font-mono text-[11px] tabular-nums text-stone-600">
              {draft.length}/{QUESTION_MAX}
            </span>
          </div>
        </form>
      ) : null}
    </section>
  );
}
