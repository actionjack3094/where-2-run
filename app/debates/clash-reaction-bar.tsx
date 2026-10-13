"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ClashReactionBar({
  upvotes,
  resonance,
  questionCount,
  href,
}: {
  upvotes: number;
  resonance: number;
  questionCount: number;
  href: string;
}) {
  const [upvoteCount, setUpvoteCount] = useState(upvotes);
  const [resonanceCount, setResonanceCount] = useState(resonance);
  const [upvoted, setUpvoted] = useState(false);
  const [resonated, setResonated] = useState(false);

  function toggleUpvote() {
    setUpvoteCount((count) => count + (upvoted ? -1 : 1));
    setUpvoted((current) => !current);
  }

  function toggleResonance() {
    setResonanceCount((count) => count + (resonated ? -1 : 1));
    setResonated((current) => !current);
  }

  const questionLabel = questionCount === 1 ? "1 voter question" : `${questionCount} voter questions`;

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ReactionButton label="Upvote" count={upvoteCount} pressed={upvoted} onClick={toggleUpvote} />
        <ReactionButton label="Resonance" count={resonanceCount} pressed={resonated} onClick={toggleResonance} />
        <Link
          href={`${href}#questions`}
          className="inline-flex h-10 items-center rounded-md px-2 text-[11px] font-medium uppercase tracking-widest text-stone-600 hover:text-amber-800"
        >
          {questionLabel}
        </Link>
      </div>
      <Link
        href={href}
        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-gold-strong px-3 text-center text-[11px] font-semibold uppercase tracking-widest text-stone-900 transition-colors hover:bg-gold"
      >
        Enter Debate / View Full Rounds
      </Link>
    </div>
  );
}

function ReactionButton({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md border px-3 text-[11px] font-medium uppercase tracking-widest transition-colors",
        pressed
          ? "border-gold bg-white text-amber-800"
          : "border-stone-300 bg-white text-stone-600 hover:border-amber-600",
      )}
    >
      {label}
      <span className="ml-2 tabular-nums">{count}</span>
    </button>
  );
}
