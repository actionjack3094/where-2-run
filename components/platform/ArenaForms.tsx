"use client";

import { useActionState } from "react";
import {
  challengeSeat,
  commentOnMatch,
  fileRebuttal,
  likeMatch,
  postOpening,
  type PlatformFormState,
} from "@/app/actions/platform";
import { Button } from "@/components/ui/button";
import { formatCoordinate, type PublicJudgment } from "@/lib/platform/types";

function outcomeLine(judgment: PublicJudgment) {
  const label = judgment.outcome === "tie" ? "Tie" : judgment.outcome === "win" ? "Win" : "Loss";
  const delta = `${judgment.eloDelta >= 0 ? "+" : ""}${judgment.eloDelta} Elo`;
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

export function OpeningForm({ primaryId }: { primaryId: string }) {
  const [state, action, pending] = useActionState(postOpening, null);
  return (
    <form action={action} className="mt-6 grid gap-3">
      <input type="hidden" name="primaryId" value={primaryId} />
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
        Opening stance
        <textarea
          name="stance"
          required
          minLength={20}
          rows={5}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
        />
      </label>
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Posting…" : "Post question"}
      </Button>
      <Status state={state} />
    </form>
  );
}

export function ChallengeForm({ debateId }: { debateId: string }) {
  const [state, action, pending] = useActionState(challengeSeat, null);
  return (
    <form action={action}>
      <input type="hidden" name="debateId" value={debateId} />
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Locking…" : "Challenge (24hr lock)"}
      </Button>
      <Status state={state} />
    </form>
  );
}

export function RebuttalForm({ debateId }: { debateId: string }) {
  const [state, action, pending] = useActionState(fileRebuttal, null);
  return (
    <form action={action} className="mt-4 grid gap-3">
      <input type="hidden" name="debateId" value={debateId} />
      <label className="grid gap-2 text-sm text-zinc-300">
        Rebuttal
        <textarea
          name="stance"
          required
          minLength={20}
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
      <div className="flex flex-wrap gap-2">
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
