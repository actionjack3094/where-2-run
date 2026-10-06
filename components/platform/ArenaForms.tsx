"use client";

import { useActionState, useEffect, useState } from "react";
import {
  commentOnMatch,
  likeMatch,
  type PlatformFormState,
} from "@/app/actions/platform";
import { acceptDebateChallenge, createPrimaryDebatePrompt, submitRebuttal } from "@/lib/actions/debates";
import { ROUND_CHAR_LIMIT } from "@/lib/debates/structure";
import { Button } from "@/components/ui/button";
import { formatCoordinate, type PublicJudgment } from "@/lib/platform/types";

function outcomeLine(judgment: PublicJudgment) {
  const label = judgment.outcome === "tie" ? "Tie" : judgment.outcome === "win" ? "Win" : "Loss";
  const delta = `${judgment.eloDelta >= 0 ? "+" : ""}${judgment.eloDelta} Civic Standing`;
  return `${label}. ${delta}. ${formatCoordinate(judgment.coordinate.x, judgment.coordinate.y)}`;
}

function Status({ state }: { state: PlatformFormState }) {
  if (!state) return null;
  if (state.error) return <p className="mt-3 text-sm text-zinc-300">{state.error}</p>;
  return (
    <div className="mt-3 text-sm leading-6 text-parchment">
      {state.judgment ? <p>{outcomeLine(state.judgment)}</p> : null}
      {state.message && !state.judgment ? <p>{state.message}</p> : null}
    </div>
  );
}

export function OpeningForm({
  primaryId,
  botSparGraceMinutes = null,
}: {
  primaryId: string;
  botSparGraceMinutes?: number | null;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: PlatformFormState, formData: FormData) =>
      createPrimaryDebatePrompt(
        primaryId,
        String(formData.get("prompt") ?? ""),
        String(formData.get("stance") ?? ""),
        formData.get("sparWithAi") === "on",
      ),
    null,
  );
  return (
    <form action={action} className="mt-6 grid gap-3">
      <label className="grid gap-2 text-sm text-zinc-300">
        Question
        <textarea
          name="prompt"
          required
          minLength={12}
          rows={3}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
        />
      </label>
      <label className="grid gap-2 text-sm text-zinc-300">
        Opening Statement
        <textarea
          name="stance"
          required
          minLength={20}
          maxLength={ROUND_CHAR_LIMIT}
          rows={5}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
        />
      </label>
      {botSparGraceMinutes != null ? (
        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="sparWithAi" className="mt-1" />
          <span>
            Spar with AI
            <span className="mt-1 block text-zinc-500">
              A same-party partner answers immediately. Leave this off and a partner engages after{" "}
              {botSparGraceMinutes} minutes if nobody accepts.
            </span>
          </span>
        </label>
      ) : null}
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Posting…" : "Post question"}
      </Button>
      <Status state={state} />
    </form>
  );
}

export function ChallengeForm({ debateId }: { debateId: string }) {
  const [state, action, pending] = useActionState(
    async () => acceptDebateChallenge(debateId),
    null,
  );
  return (
    <form action={action}>
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Locking…" : "Accept Challenge"}
      </Button>
      <Status state={state} />
    </form>
  );
}

function formatLock(remainingMs: number) {
  if (remainingMs <= 0) return "The 24-hour lock has expired.";
  const total = Math.floor(remainingMs / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Seat locked · ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function SeatLockCountdown({ until }: { until: string }) {
  const [label, setLabel] = useState("Seat locked");
  useEffect(() => {
    const tick = () => setLabel(formatLock(Date.parse(until) - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return <p className="text-sm text-zinc-400">{label}</p>;
}

export function RebuttalForm({
  debateId,
  label = "Rebuttal 1",
}: {
  debateId: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: PlatformFormState, formData: FormData) =>
      submitRebuttal(debateId, String(formData.get("stance") ?? "")),
    null,
  );
  return (
    <form action={action} className="mt-4 grid gap-3">
      <label className="grid gap-2 text-sm text-zinc-300">
        {label}
        <textarea
          name="stance"
          required
          minLength={20}
          maxLength={ROUND_CHAR_LIMIT}
          rows={5}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
        />
      </label>
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Filing…" : "File rebuttal"}
      </Button>
      <Status state={state} />
    </form>
  );
}

export function LockedSeat({
  debateId,
  until,
  isHolder,
  label = "Rebuttal 1",
}: {
  debateId: string;
  until: string;
  isHolder: boolean;
  label?: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRemaining(Date.parse(until) - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [until]);
  const open = remaining == null || remaining > 0;
  return (
    <div className="mt-4">
      <SeatLockCountdown until={until} />
      {isHolder && open ? <RebuttalForm debateId={debateId} label={label} /> : null}
    </div>
  );
}

export function BallotEngage({
  debateId,
  sideA,
  sideB,
  viewerSupportId,
  comments,
}: {
  debateId: string;
  sideA: { id: string; name: string };
  sideB: { id: string; name: string };
  viewerSupportId: string | null;
  comments: { id: string; author: string; body: string }[];
}) {
  const [likeState, likeAction, likePending] = useActionState(likeMatch, null);
  const [commentState, commentAction, commentPending] = useActionState(commentOnMatch, null);

  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <p className="text-[11px] uppercase tracking-widest text-zinc-500">
        Likes widen reach. Civic Standing stays put.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[sideA, sideB].map((side) => (
          <form key={side.id} action={likeAction}>
            <input type="hidden" name="debateId" value={debateId} />
            <input type="hidden" name="supportedId" value={side.id} />
            <Button
              type="submit"
              size="sm"
              variant={viewerSupportId === side.id ? "gold" : "outline"}
              disabled={likePending}
            >
              Like {side.name}
            </Button>
          </form>
        ))}
      </div>
      <Status state={likeState} />
      <ul className="mt-4 grid gap-3">
        {comments.map((comment) => (
          <li key={comment.id} className="text-sm leading-6 text-zinc-300">
            <span className="font-medium text-parchment">{comment.author}. </span>
            {comment.body}
          </li>
        ))}
      </ul>
      <form action={commentAction} className="mt-4 grid gap-2">
        <input type="hidden" name="debateId" value={debateId} />
        <textarea
          name="body"
          required
          maxLength={400}
          rows={3}
          placeholder="Comment as a constituent"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        />
        <Button type="submit" variant="outline" disabled={commentPending}>
          {commentPending ? "Posting…" : "Comment"}
        </Button>
        <Status state={commentState} />
      </form>
    </div>
  );
}
