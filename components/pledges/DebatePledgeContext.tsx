"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/db/supabase";

export const QUICK_PLEDGE_USD = 50;

type DebatePledgeValue = {
  electionId: string | null;
  isPledged: (candidateId: string) => boolean;
  markPledged: (candidateId: string) => void;
  error: string | null;
  setError: (message: string | null) => void;
};

const DebatePledgeContext = createContext<DebatePledgeValue | null>(null);

/** Null outside a debate, where the donate button falls back to the Stripe modal. */
export function useDebatePledge() {
  return useContext(DebatePledgeContext);
}

/**
 * Shared state for the one-click "Donate $50" buttons on a debate page. A
 * candidate can appear under several buttons, so pledged state and the error
 * message live here rather than in each button.
 */
export function DebatePledgeProvider({
  electionId,
  donorId,
  children,
}: {
  electionId: string | null;
  donorId: string | null;
  children: React.ReactNode;
}) {
  const [pledged, setPledged] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Restore buttons the viewer already pledged (RLS limits rows to their own).
  useEffect(() => {
    if (!donorId || !electionId) return;
    let cancelled = false;
    void supabase
      .from("campaign_pledges")
      .select("candidate_id")
      .eq("donor_id", donorId)
      .eq("election_id", electionId)
      .eq("status", "pending")
      .is("stripe_setup_intent_id", null)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPledged(new Set(data.map((row) => row.candidate_id as string)));
      });
    return () => {
      cancelled = true;
    };
  }, [donorId, electionId]);

  const markPledged = useCallback((candidateId: string) => {
    setPledged((current) => new Set(current).add(candidateId));
  }, []);

  const value = useMemo<DebatePledgeValue>(
    () => ({
      electionId,
      isPledged: (candidateId) => pledged.has(candidateId),
      markPledged,
      error,
      setError,
    }),
    [electionId, pledged, markPledged, error],
  );

  return <DebatePledgeContext.Provider value={value}>{children}</DebatePledgeContext.Provider>;
}

/** Shows the last pledge error near the donate buttons. */
export function PledgeError({ className }: { className?: string }) {
  const context = useDebatePledge();
  if (!context?.error) return null;
  return (
    <p role="alert" className={className ?? "mt-2 text-xs text-rose-300"}>
      {context.error}
    </p>
  );
}
