"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ingestAuthoredPrompt } from "@/app/actions/debates/classify-prompt";
import { updateVector } from "@/app/actions/vector";
import { IdeologyRadar } from "@/app/profile/components/IdeologyRadar";
import { StanceModal } from "@/components/debate/StanceModal";
import { QUIZ_QUESTIONS, type PolicyOption } from "@/lib/ideology/questions";
import { SIX_AXIS_IDS, SIX_AXIS_LABELS, type SixAxisId } from "@/lib/ideology/six-axis";
import { formatRecord } from "@/lib/leaderboard";
import type { ProfileHubData } from "@/lib/profile/hub";
import { cn } from "@/lib/utils";

const EXIT_MS = 280;

function isSixAxisId(value: string): value is SixAxisId {
  return (SIX_AXIS_IDS as readonly string[]).includes(value);
}

function isQuestionBankMissing(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /election_questions|user_stances|question bank/i.test(message);
}

async function recordDeckStance(prompt: string, axisId: SixAxisId, option: PolicyOption) {
  try {
    const result = await ingestAuthoredPrompt({
      prompt,
      positionLabel: option.label,
      positionScore: option.score,
    });
    return result.ideologyVector;
  } catch (error) {
    if (!isQuestionBankMissing(error)) throw error;
    const result = await updateVector({ axisId, score: option.score });
    return result.ideologyVector;
  }
}

export function AboutMe({
  profile,
  onVectorUpdated,
}: {
  profile: ProfileHubData;
  onVectorUpdated: (vector: number[]) => void;
}) {
  const bio = profile.bio?.trim();

  return (
    <div className="mt-10 flex flex-col gap-14">
      <CalibrationDeck onVectorUpdated={onVectorUpdated} />

      <section aria-labelledby="about-bio-heading">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Biography
        </p>
        <h2
          id="about-bio-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          {profile.username}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-300">
          {bio || "No campaign biography on file yet."}
        </p>
      </section>

      <section aria-labelledby="about-record-heading" className="grid grid-cols-2 gap-3">
        <h2 id="about-record-heading" className="sr-only">
          Debate record and ELO
        </h2>
        <Stat
          label="Win / Loss"
          value={formatRecord(profile.wins, profile.losses)}
        />
        <Stat label="ELO" value={String(profile.eloRating)} />
      </section>

      <IdeologyRadar
        key={profile.ideologyVector.join(",")}
        candidateId={profile.userId}
        vector={profile.ideologyVector}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-gold/50 bg-zinc-900 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-widest text-gold">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight text-parchment">
        {value}
      </p>
    </article>
  );
}

function CalibrationDeck({
  onVectorUpdated,
}: {
  onVectorUpdated: (vector: number[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stanceOpen, setStanceOpen] = useState(false);
  const [stanceTopic, setStanceTopic] = useState<string | null>(null);
  const origin = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  const question = QUIZ_QUESTIONS[index % QUIZ_QUESTIONS.length];
  const upcoming = QUIZ_QUESTIONS[(index + 1) % QUIZ_QUESTIONS.length];
  const axisId = isSixAxisId(question.id) ? question.id : "economy";

  const advance = useCallback(() => {
    timer.current = window.setTimeout(() => {
      setIndex((current) => current + 1);
      setDragX(0);
      setLeaving(false);
      setPending(false);
    }, EXIT_MS);
  }, []);

  const answer = useCallback(
    async (option: PolicyOption) => {
      if (pending || leaving) return;
      setPending(true);
      setError(null);
      setDragX(option.score >= 0.5 ? 420 : -420);
      setLeaving(true);
      try {
        const result = await recordDeckStance(question.prompt, axisId, option);
        onVectorUpdated(result);
        advance();
      } catch (caught) {
        setLeaving(false);
        setDragX(0);
        setPending(false);
        setError(caught instanceof Error ? caught.message : "Could not update this vector.");
      }
    },
    [advance, axisId, leaving, onVectorUpdated, pending, question.prompt],
  );

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (pending || leaving) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;
    origin.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (!dragging || pending || leaving) return;
    setDragX(event.clientX - origin.current);
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > 140) {
      setLeaving(true);
      setDragX(dragX > 0 ? 420 : -420);
      advance();
      return;
    }
    setDragX(0);
  }

  return (
    <section aria-labelledby="calibration-deck-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Continuous calibration
        </p>
        <h2
          id="calibration-deck-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Policy deck
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Answer a plank to move this campaign&apos;s ideological coordinates.
          Swipe a card aside to leave it unmarked.
        </p>
      </header>

      <p className="mt-8 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
        Question {(index % QUIZ_QUESTIONS.length) + 1} of {QUIZ_QUESTIONS.length}
      </p>

      <div className="relative mt-4 min-h-[22rem]">
        <article
          aria-hidden
          className="absolute inset-x-0 top-2 rounded-xl border border-gold/30 bg-zinc-900 p-6 opacity-80"
          style={{ transform: "scale(0.96)" }}
        >
          <p className="font-display text-xl font-semibold leading-snug tracking-tight text-zinc-500">
            {upcoming.prompt}
          </p>
        </article>

        <article
          key={question.id + index}
          aria-live="polite"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            "relative cursor-grab touch-pan-y rounded-xl border border-gold/50 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)] active:cursor-grabbing",
            leaving || dragging ? "transition-none" : "transition-transform duration-200",
            leaving && "transition-transform duration-300",
          )}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)`,
          }}
        >
          <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
            {SIX_AXIS_LABELS[axisId]}
          </p>
          <h3 className="mt-4 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
            {question.prompt}
          </h3>
          <ul className="mt-6 flex flex-col gap-2">
            {question.options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={pending || leaving}
                  onClick={() => void answer(option)}
                  className="w-full rounded-lg border border-gold/30 bg-zinc-950 px-4 py-3 text-left text-sm leading-6 text-zinc-200 transition-colors hover:border-gold hover:text-parchment disabled:pointer-events-none disabled:opacity-50"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending || leaving}
            onClick={() => {
              setStanceTopic(question.prompt);
              setStanceOpen(true);
            }}
            className="mt-4 w-full rounded-lg border border-gold bg-gold px-4 py-3 text-center font-display text-xs font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold-strong disabled:pointer-events-none disabled:opacity-50"
          >
            Write Custom Stance
          </button>
        </article>
      </div>

      {error ? (
        <p className="mt-4 text-sm leading-6 text-zinc-400" role="alert">
          {error}
        </p>
      ) : null}

      {stanceTopic ? (
        <StanceModal
          open={stanceOpen}
          onOpenChange={setStanceOpen}
          initialTopic={stanceTopic}
        />
      ) : null}
    </section>
  );
}
