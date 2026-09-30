"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  QUICK_PLEDGE_USD,
  useDebatePledge,
} from "@/components/pledges/DebatePledgeContext";
import { usePledge } from "@/components/pledges/PledgeHost";
import { submitPledge } from "@/lib/actions/pledge";
import { supabase } from "@/lib/db/supabase";
import type { DebateCandidate } from "@/types/database.types";

type Props = {
  candidate: Pick<DebateCandidate, "id" | "username">;
  className?: string;
  size?: "sm" | "default" | "lg";
};

/**
 * Inside a debate page (with a resolved race) this is a one-click conditional
 * pledge. Anywhere else it opens the Stripe card-hold modal.
 */
export function BackCandidateButton(props: Props) {
  const debatePledge = useDebatePledge();
  return debatePledge?.electionId ? (
    <QuickPledgeButton {...props} electionId={debatePledge.electionId} />
  ) : (
    <ModalPledgeButton {...props} />
  );
}

function ModalPledgeButton({ candidate, className, size = "sm" }: Props) {
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

function QuickPledgeButton({
  candidate,
  className,
  size = "sm",
  electionId,
}: Props & { electionId: string }) {
  const router = useRouter();
  const debatePledge = useDebatePledge();
  const [pending, startTransition] = useTransition();
  const pledged = debatePledge?.isPledged(candidate.id) ?? false;

  function handleClick() {
    if (!debatePledge || pending || pledged) return;
    debatePledge.setError(null);

    startTransition(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const result = await submitPledge(
          candidate.id,
          electionId,
          QUICK_PLEDGE_USD,
          data.session?.access_token,
        );
        if (result.ok) {
          debatePledge.markPledged(candidate.id);
          router.refresh();
        } else {
          debatePledge.setError(result.error);
        }
      } catch {
        debatePledge.setError("We couldn't lock in that pledge. Please try again.");
      }
    });
  }

  return (
    <Button
      type="button"
      size={size}
      variant="gold"
      className={className}
      disabled={pending || pledged}
      aria-label={
        pledged
          ? `Pledged $${QUICK_PLEDGE_USD} to ${candidate.username}`
          : `Donate $${QUICK_PLEDGE_USD} to ${candidate.username}`
      }
      onClick={handleClick}
    >
      {pledged ? `Pledged $${QUICK_PLEDGE_USD}` : pending ? "Pledging…" : `Donate $${QUICK_PLEDGE_USD}`}
    </Button>
  );
}
