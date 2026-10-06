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
              "text-xs text-stone-600 hover:text-stone-900  ",
              nameClassName,
            )}
          >
            {candidate.username}
          </Link>
          <BackCandidateButton candidate={candidate} />
        </>
      ) : (
        <span className={cn("text-xs text-stone-600", nameClassName)}>{emptyLabel}</span>
      )}
    </div>
  );
}
