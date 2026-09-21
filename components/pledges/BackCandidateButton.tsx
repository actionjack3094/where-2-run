"use client";

import { Button } from "@/components/ui/button";
import { usePledge } from "@/components/pledges/PledgeHost";
import type { DebateCandidate } from "@/types/database.types";

export function BackCandidateButton({
  candidate,
  className,
  size = "sm",
}: {
  candidate: Pick<DebateCandidate, "id" | "username">;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const { openPledge } = usePledge();

  return (
    <Button
      type="button"
      size={size}
      variant="gold"
      className={className}
      aria-label={`Donate $50 to ${candidate.username}`}
      onClick={() =>
        openPledge({
          candidateId: candidate.id,
          candidateName: candidate.username,
        })
      }
    >
      Donate $50
    </Button>
  );
}
