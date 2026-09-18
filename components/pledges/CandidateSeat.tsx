"use client";

import Link from "next/link";
import { BackCandidateButton } from "@/components/pledges/BackCandidateButton";
import { cn } from "@/lib/utils";
import type { DebateCandidate } from "@/types/database.types";

export function CandidateSeat({
  candidate,
  align = "start",
  emptyLabel = "Open seat",
  nameClassName,
}: {
  candidate: DebateCandidate | null;
  align?: "start" | "end";
  emptyLabel?: string;
  nameClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        align === "end" && "flex-row-reverse justify-start",
      )}
    >
      {candidate ? (
        <>
          <Link
            href={`/candidate/${candidate.id}`}
            className={cn(
              "text-xs text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50",
              nameClassName,
            )}
          >
            {candidate.username}
          </Link>
          <BackCandidateButton candidate={candidate} />
        </>
      ) : (
        <span className={cn("text-xs text-zinc-400", nameClassName)}>{emptyLabel}</span>
      )}
    </div>
  );
}
