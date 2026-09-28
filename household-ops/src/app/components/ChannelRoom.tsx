"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import { LoaderCircle, Send } from "lucide-react";
import { mediateChannel } from "@/app/actions/mediate";
import { sendMessage } from "@/app/actions/messages";

export type HouseholdRole = "User A" | "User B";

export type ChannelMessageView = {
  id: string;
  content: string;
  createdAt: string;
  role: HouseholdRole | null;
  displayName: string;
};

export type MediationResolution = {
  tone: "neutral" | "collaborative" | "heated" | "stalled";
  friction_points: string[];
  proposed_compromise: string;
  needs_cooldown: boolean;
};

export type ChannelRoomProps = {
  channel: {
    id: string;
    topic: string;
    status: string;
  };
  viewer: {
    role: HouseholdRole;
    displayName: string;
  };
  messages: ChannelMessageView[];
  latestResolution: MediationResolution | null;
};

const TONE_STYLE = {
  collaborative: {
    label: "Collaborative",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  neutral: {
    label: "Neutral",
    badge: "bg-amber-50 text-amber-950 ring-amber-600/20",
    dot: "bg-amber-500",
  },
  stalled: {
    label: "Stalled",
    badge: "bg-amber-100 text-amber-950 ring-amber-700/25",
    dot: "bg-amber-600",
  },
  heated: {
    label: "Heated",
    badge: "bg-red-50 text-red-800 ring-red-600/20",
    dot: "bg-red-500",
  },
} as const;

function actionError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong. Try again.";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ChannelRoom({
  channel,
  viewer,
  messages,
  latestResolution,
}: ChannelRoomProps) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [mediateError, setMediateError] = useState<string | null>(null);
  const [freshResolution, setFreshResolution] = useState<MediationResolution | null>(null);
  const [isSending, startSend] = useTransition();
  const [isMediating, startMediate] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const seenCount = useRef(messages.length);
  const scrollCardIntoView = useRef(false);
  const resolution = freshResolution ?? latestResolution;

  useEffect(() => {
    if (messages.length > seenCount.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
    seenCount.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!scrollCardIntoView.current || !resolution) return;
    scrollCardIntoView.current = false;
    cardRef.current?.scrollIntoView({ block: "start" });
  }, [resolution]);

  function onMediate() {
    setMediateError(null);
    startMediate(async () => {
      try {
        const result = await mediateChannel(channel.id);
        scrollCardIntoView.current = true;
        setFreshResolution(result);
      } catch (error) {
        setMediateError(actionError(error));
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setSendError(null);
    startSend(async () => {
      try {
        await sendMessage(channel.id, text);
        setDraft("");
      } catch (error) {
        setSendError(actionError(error));
      }
    });
  }

  return (
    <div className="flex h-dvh flex-col bg-[#f4f1ec] text-stone-900">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
            Mediation channel
          </p>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{channel.topic}</h1>
          <p className="mt-1 text-sm text-stone-500">
            <span className="capitalize">{channel.status}</span>
            <span aria-hidden="true"> · </span>
            <span>
              You are {viewer.displayName} ({viewer.role})
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onMediate}
          disabled={isMediating}
          aria-busy={isMediating}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-wait disabled:opacity-70"
        >
          {isMediating ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {isMediating ? "Mediating…" : "Mediate Channel"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6">
          {mediateError ? (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {mediateError}
            </p>
          ) : null}
          {isMediating ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600"
            >
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Reading the transcript and preparing a resolution.
            </p>
          ) : null}
          {resolution ? <MediationCard cardRef={cardRef} resolution={resolution} /> : null}

          <section aria-label="Messages" className="flex flex-col gap-3">
            {messages.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-300 bg-white/70 px-4 py-8 text-center text-sm text-stone-500">
                No messages yet. Start with what needs deciding.
              </p>
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
            <div ref={endRef} />
          </section>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-stone-200 bg-white px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <label htmlFor="channel-message" className="sr-only">
            Message
          </label>
          <input
            id="channel-message"
            name="content"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Say what you need from this conversation"
            maxLength={4000}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-full border border-stone-300 bg-stone-50 px-4 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-500 focus:bg-white"
          />
          <button
            type="submit"
            disabled={isSending || draft.trim().length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            Send
          </button>
        </div>
        {sendError ? (
          <p role="alert" className="mx-auto mt-2 w-full max-w-3xl text-sm text-red-700">
            {sendError}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChannelMessageView }) {
  const isUserB = message.role === "User B";
  const roleLabel = message.role ?? "Member";

  return (
    <article className={clsx("flex", isUserB ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%]",
          isUserB
            ? "rounded-br-md bg-[#243028] text-stone-50"
            : "rounded-bl-md border border-stone-200 bg-white text-stone-900 shadow-sm",
        )}
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase",
              isUserB ? "bg-white/10 text-stone-200" : "bg-stone-100 text-stone-600",
            )}
          >
            {roleLabel}
          </span>
          <span className={clsx("text-xs", isUserB ? "text-stone-300" : "text-stone-500")}>
            {message.displayName}
          </span>
          <time
            dateTime={message.createdAt}
            className={clsx("text-xs", isUserB ? "text-stone-300" : "text-stone-400")}
          >
            {formatTime(message.createdAt)}
          </time>
        </div>
        <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
      </div>
    </article>
  );
}

function MediationCard({
  cardRef,
  resolution,
}: {
  cardRef: React.Ref<HTMLElement>;
  resolution: MediationResolution;
}) {
  const tone = TONE_STYLE[resolution.tone];
  const points = resolution.friction_points.map((point) => point.trim()).filter(Boolean);

  return (
    <article
      ref={cardRef}
      className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      {resolution.needs_cooldown ? (
        <p
          role="alert"
          className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          Cooling-Off Period Recommended — Step away before responding.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <h2 className="text-base font-semibold tracking-tight">Mediation</h2>
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
            tone.badge,
          )}
        >
          <span className={clsx("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
          {tone.label}
        </span>
      </div>
      <div className="space-y-4 px-4 pb-4">
        <section>
          <h3 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
            Friction points
          </h3>
          {points.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">No specific points of misalignment.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-stone-800">
              {points.map((point, index) => (
                <li key={`${index}-${point}`}>{point}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <h3 className="text-xs font-medium tracking-wide text-emerald-800 uppercase">
            Proposed compromise
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-950">
            {resolution.proposed_compromise}
          </p>
        </section>
      </div>
    </article>
  );
}
