"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { submitCandidateAnswer, submitConstituentQuestion } from "@/app/lib/actions/qa";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { submitClashRebuttal, toggleQuestionUpvote } from "@/lib/actions/clash-room";
import { canFileRebuttal, clashClock, REBUTTAL_CHAR_LIMIT, type ClashWindow } from "@/lib/debates/clash-room";
import type { ClashParticipantView, ClashQuestionView, ClashRoomView } from "@/lib/debates/load-clash-room";
import { cn } from "@/lib/utils";

const QUESTION_MAX = 280;

export function ClashExperience({ view }: { view: ClashRoomView }) {
  const [locked, setLocked] = useState(view.window === "locked");
  const [clock, setClock] = useState(() =>
    view.rebuttalExpiresAt ? clashClock(view.rebuttalExpiresAt, Date.now()).label : "",
  );
  const stage: ClashWindow = locked ? "locked" : view.window;

  useEffect(() => {
    if (view.window === "locked" || !view.rebuttalExpiresAt) return;
    const tick = () => {
      const next = clashClock(view.rebuttalExpiresAt, Date.now());
      setClock(next.label);
      if (next.expired) setLocked(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [view.rebuttalExpiresAt, view.window]);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs text-stone-500">
          <Link href="/debates" className="text-amber-800">
            Debates
          </Link>
        </p>
        <header className="mt-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">{view.badge}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-stone-900">
            {view.prompt}
          </h1>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <StatusBadge stage={stage} clock={clock} />
            <ResonanceTally
              sideA={view.sideA}
              sideB={view.sideB}
              final={stage === "locked"}
            />
          </div>
        </header>

        <section aria-label="Head-to-head" className="mt-8 grid gap-4 lg:grid-cols-2">
          <CandidateColumn
            debateId={view.id}
            role="First stance"
            participant={view.sideA}
            viewerId={view.viewerId}
            stage={stage}
          />
          {view.sideB ? (
            <CandidateColumn
              debateId={view.id}
              role="Challenger"
              participant={view.sideB}
              viewerId={view.viewerId}
              stage={stage}
            />
          ) : (
            <article className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Challenger</p>
              <p className="mt-3 text-sm leading-6 text-stone-600">This seat is still open.</p>
            </article>
          )}
        </section>

        <ConstituentHub view={view} locked={stage === "locked"} />
      </div>
    </main>
  );
}

function StatusBadge({ stage, clock }: { stage: ClashWindow; clock: string }) {
  if (stage === "rebuttal") {
    return (
      <p
        role="status"
        className="inline-flex w-fit flex-wrap items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-amber-900"
      >
        Round 2: Rebuttal Window
        <span className="font-mono text-xs tabular-nums tracking-normal" suppressHydrationWarning>
          {clock}
        </span>
      </p>
    );
  }
  if (stage === "locked") {
    return (
      <p
        role="status"
        className="inline-flex w-fit rounded-full bg-slate-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-white"
      >
        Debate concluded · Final transcript
      </p>
    );
  }
  return (
    <p
      role="status"
      className="inline-flex w-fit rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-600"
    >
      Round 1: Opening
    </p>
  );
}

function ResonanceTally({
  sideA,
  sideB,
  final,
}: {
  sideA: ClashParticipantView;
  sideB: ClashParticipantView | null;
  final: boolean;
}) {
  return (
    <p
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600"
      aria-label={final ? "Final in-district votes" : "In-district resonance"}
    >
      <span className="font-medium uppercase tracking-widest text-stone-500">
        {final ? "Final in-district votes" : "In-district resonance"}
      </span>
      <span>
        {sideA.name} <span className="font-mono tabular-nums text-stone-900">{sideA.resonance}</span>
      </span>
      {sideB ? (
        <span>
          {sideB.name} <span className="font-mono tabular-nums text-stone-900">{sideB.resonance}</span>
        </span>
      ) : null}
    </p>
  );
}

function CandidateColumn({
  debateId,
  role,
  participant,
  viewerId,
  stage,
}: {
  debateId: string;
  role: string;
  participant: ClashParticipantView;
  viewerId: string | null;
  stage: ClashWindow;
}) {
  const filing = canFileRebuttal({
    window: stage,
    viewerId,
    candidateId: participant.id,
    rebuttal: participant.rebuttal,
  });

  return (
    <article className="rounded-2xl border border-amber-500/30 bg-white px-5 py-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-stone-500">{role}</p>
      <div className="mt-3 flex items-start gap-3">
        <CandidateAvatar name={participant.name} avatarUrl={participant.avatarUrl} />
        <div className="min-w-0">
          <Link href={`/profile/${participant.id}`} className="block truncate text-base font-semibold text-stone-900 hover:text-amber-800">
            {participant.name}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={participant.status} />
            <span className="text-[11px] font-medium uppercase tracking-widest text-stone-500">
              {participant.alignment == null ? "Alignment unavailable" : `${participant.alignment}% aligned`}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Round 1 · Opening</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-800">
          {participant.opening || "No opening stance filed."}
        </p>
      </div>

      <div className="mt-5">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-stone-500">Round 2 · Rebuttal</h2>
        {participant.rebuttal ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-800">{participant.rebuttal}</p>
        ) : filing ? (
          <RebuttalForm debateId={debateId} />
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-stone-300 bg-stone-100 px-4 py-5 text-sm text-stone-500">
            {stage === "locked"
              ? "No rebuttal filed."
              : viewerId === participant.id
                ? "Your rebuttal opens with the 48-hour window."
                : "Awaiting candidate rebuttal..."}
          </p>
        )}
      </div>
    </article>
  );
}

function StatusChip({ status }: { status: ClashParticipantView["status"] }) {
  const onBallot = status === "ON THE BALLOT";
  const contender = status === "CONTENDER";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        onBallot && "bg-gold-strong text-stone-900 ring-2 ring-gold",
        contender && "bg-gold-strong text-stone-900",
        !onBallot && !contender && "border border-stone-300 bg-stone-100 text-stone-600",
      )}
    >
      {status}
    </span>
  );
}

function RebuttalForm({ debateId }: { debateId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setError(null);
        void submitClashRebuttal(debateId, draft).then((result) => {
          setPending(false);
          if (result.error) {
            setError(result.error);
            return;
          }
          setDraft("");
          router.refresh();
        });
      }}
    >
      <label className="grid gap-2 text-sm text-stone-600">
        Your rebuttal
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, REBUTTAL_CHAR_LIMIT))}
          maxLength={REBUTTAL_CHAR_LIMIT}
          rows={5}
          required
          placeholder="Answer the opening in 500 characters or fewer."
          className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="rounded-md bg-gold-strong px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Submit Rebuttal"}
        </button>
        <span className="font-mono text-[11px] tabular-nums text-stone-500">
          {draft.length}/{REBUTTAL_CHAR_LIMIT}
        </span>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

function ConstituentHub({ view, locked }: { view: ClashRoomView; locked: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const seated =
    view.viewerId != null &&
    (view.viewerId === view.sideA.id || view.viewerId === view.sideB?.id);
  const canAsk = view.canAsk && !locked;

  return (
    <section id="questions" aria-label="Constituent questions" className="mt-10 border-t border-amber-500/30 pt-8">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Constituent questions</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Verified voters in this district ask one question. The two candidates answer it directly.
      </p>

      {canAsk ? (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError(null);
            void submitConstituentQuestion(view.id, draft).then((result) => {
              setPending(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              setDraft("");
              router.refresh();
            });
          }}
        >
          <label className="grid gap-2 text-sm text-stone-700">
            Ask both candidates a question on this topic (1 question per verified voter)
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, QUESTION_MAX))}
              maxLength={QUESTION_MAX}
              rows={3}
              required
              disabled={locked}
              className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:bg-stone-100"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <button
              type="submit"
              disabled={pending || locked || draft.trim().length === 0}
              className="rounded-md border border-amber-500/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-stone-800 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Ask"}
            </button>
            <span className="font-mono text-[11px] tabular-nums text-stone-500">
              {draft.length}/{QUESTION_MAX}
            </span>
          </div>
        </form>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {view.questions.length === 0 ? (
        <p className="mt-6 text-sm text-stone-600">No constituent questions yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {view.questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              locked={locked}
              canVote={view.viewerInDistrict && !locked}
              canReply={seated && !locked && !question.answers.some((answer) => answer.candidateId === view.viewerId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionCard({
  question,
  locked,
  canVote,
  canReply,
}: {
  question: ClashQuestionView;
  locked: boolean;
  canVote: boolean;
  canReply: boolean;
}) {
  const router = useRouter();
  const [upvotes, setUpvotes] = useState(question.upvotes);
  const [pressed, setPressed] = useState(question.viewerUpvoted);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState("");

  return (
    <li className="rounded-xl border border-stone-200 bg-white px-4 py-4">
      <p className="text-sm leading-6 text-stone-800">
        <span className="font-medium text-stone-900">{question.voterName}. </span>
        {question.content}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-pressed={pressed}
          disabled={!canVote || pending}
          onClick={() => {
            if (!canVote || pending) return;
            setPending(true);
            setError(null);
            void toggleQuestionUpvote(question.id).then((result) => {
              setPending(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              if (typeof result.count === "number") setUpvotes(result.count);
              if (typeof result.upvoted === "boolean") setPressed(result.upvoted);
              router.refresh();
            });
          }}
          className={cn(
            "inline-flex h-9 items-center rounded-md border px-3 text-[11px] font-medium uppercase tracking-widest",
            pressed ? "border-gold bg-amber-50 text-amber-800" : "border-stone-300 text-stone-600",
            (!canVote || pending) && "cursor-not-allowed opacity-60",
          )}
        >
          {locked ? "Final votes" : "Upvote"}
          <span className="ml-2 font-mono tabular-nums">{upvotes}</span>
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {question.answers.length > 0 ? (
        <ul className="mt-3 grid gap-2 border-l border-amber-500/30 pl-3">
          {question.answers.map((answer) => (
            <li key={answer.id} className="text-sm leading-6 text-stone-700">
              <span className="font-medium text-amber-800">{answer.candidateName}. </span>
              {answer.content}
            </li>
          ))}
        </ul>
      ) : null}
      {canReply ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError(null);
            void submitCandidateAnswer(question.id, reply).then((result) => {
              setPending(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              setReply("");
              router.refresh();
            });
          }}
        >
          <label className="grid gap-2 text-sm text-stone-600">
            Direct reply
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={3}
              required
              disabled={locked}
              className="rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </label>
          <button
            type="submit"
            disabled={pending || locked || reply.trim().length === 0}
            className="justify-self-start rounded-md bg-gold-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send reply"}
          </button>
        </form>
      ) : null}
    </li>
  );
}
