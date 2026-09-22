"use client";

import { useEffect, useState, useTransition } from "react";
import { castJuryVote } from "@/app/actions/debate/cast-jury-vote";
import { loadCivicVerification } from "@/app/actions/civic/verify-address";
import { Button } from "@/components/ui/button";
import { isMarginalConfidence, parseScore } from "@/lib/arena/evaluations";
import {
  checkLocalEligibility,
  juryLockedCopy,
} from "@/lib/civic-fencing";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";

function JuryAppealPanel({
  debateId,
  aiScore,
  electionId,
  districtName,
  ocdIdentifiers,
  className,
}: {
  debateId: string;
  aiScore: number | string | null | undefined;
  electionId: string | null;
  districtName: string | null;
  ocdIdentifiers?: readonly string[];
  className?: string;
}) {
  const [fetchedIds, setFetchedIds] = useState<readonly string[] | null>(
    ocdIdentifiers ?? null,
  );
  const [pending, startTransition] = useTransition();
  const [voted, setVoted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ocdIdentifiers) {
      setFetchedIds(ocdIdentifiers);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? null;
        if (!token) {
          if (!cancelled) setFetchedIds([]);
          return;
        }
        const profile = await loadCivicVerification(token);
        if (!cancelled) setFetchedIds(profile.ocdIdentifiers);
      } catch {
        if (!cancelled) setFetchedIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ocdIdentifiers]);

  const loaded = fetchedIds !== null;
  const eligible = loaded && checkLocalEligibility(fetchedIds, electionId);
  const confidence = parseScore(aiScore);

  function vote(voteDirection: boolean) {
    if (!eligible || pending || voted) return;
    setError(null);
    startTransition(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const result = await castJuryVote({
          debateId,
          voteDirection,
          accessToken: data.session?.access_token ?? null,
        });
        setVoted(true);
        setNotice(
          result.closed
            ? "Quorum reached. The appeal is closed and the candidate's ELO is finalized."
            : `Vote recorded. ${result.voteCount} of ${result.quorum} constituent votes are in.`,
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not cast that jury vote.");
      }
    });
  }

  return (
    <section
      className={cn("rounded-lg border border-gold/40 bg-zinc-950/70 px-4 py-3", className)}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
        Local jury appeal
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">
        AI confidence {confidence.toFixed(2)} is marginal. Verified constituents can
        validate or reject the argument.
      </p>

      {!loaded ? (
        <p className="mt-3 text-sm leading-6 text-zinc-500">Checking district eligibility…</p>
      ) : eligible ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="gold"
            size="sm"
            disabled={pending || voted}
            onClick={() => vote(true)}
          >
            Validate Argument
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || voted}
            onClick={() => vote(false)}
          >
            Reject Argument
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-gold">
          {juryLockedCopy(districtName, electionId)}
        </p>
      )}

      {notice ? <p className="mt-3 text-sm leading-6 text-parchment">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm leading-6 text-red-300">{error}</p> : null}
    </section>
  );
}

export function JuryAppealCard({
  debateId,
  aiScore,
  electionId,
  districtName,
  ocdIdentifiers,
  className,
}: {
  debateId: string;
  aiScore: number | string | null | undefined;
  electionId: string | null;
  districtName: string | null;
  ocdIdentifiers?: readonly string[];
  className?: string;
}) {
  if (!isMarginalConfidence(aiScore)) return null;

  return (
    <JuryAppealPanel
      debateId={debateId}
      aiScore={aiScore}
      electionId={electionId}
      districtName={districtName}
      ocdIdentifiers={ocdIdentifiers}
      className={className}
    />
  );
}
