"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { lockCampaignTarget } from "@/app/actions/campaign/lock-target";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";

const UNLOCK_STREAK = 10;

export function TargetRaceButton({
  election_id,
  className,
}: {
  election_id: string;
  className?: string;
}) {
  const [streak, setStreak] = useState(0);
  const [ocdId, setOcdId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStreak() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;
      const { data: election } = await supabase
        .from("elections")
        .select("ocd_id")
        .eq("id", election_id)
        .maybeSingle();

      const districtId = (election as { ocd_id?: string | null } | null)?.ocd_id ?? null;
      if (!userId) {
        if (!cancelled) {
          setOcdId(districtId);
          setReady(true);
        }
        return;
      }

      const { data: target } = await supabase
        .from("campaign_targets")
        .select("alignment_streak, is_locked")
        .eq("user_id", userId)
        .eq("election_id", election_id)
        .maybeSingle();

      if (cancelled) return;
      const row = target as { alignment_streak?: number | null; is_locked?: boolean | null } | null;
      setOcdId(districtId);
      setStreak(row?.alignment_streak ?? 0);
      setLocked(Boolean(row?.is_locked));
      setReady(true);
    }

    void loadStreak();
    return () => {
      cancelled = true;
    };
  }, [election_id]);

  const unlocked = ready && !locked && streak >= UNLOCK_STREAK && Boolean(ocdId);

  async function lockRace() {
    if (!unlocked || busy || !ocdId) return;
    setBusy(true);
    setError(null);
    try {
      await lockCampaignTarget(ocdId);
      setLocked(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not lock this race.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn(className)}>
      {locked ? (
        <p className="text-sm leading-6 text-brass">Targeting locked.</p>
      ) : unlocked ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void lockRace()}
          className="inline-flex h-10 items-center justify-center rounded-md border border-brass bg-brass px-4 text-xs font-medium uppercase tracking-widest text-charcoal transition-colors hover:bg-brass-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Locking…" : "Target this Race"}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="inline-flex max-w-xs items-start gap-2 rounded-md border border-zinc-700 px-3 py-2 text-left text-xs font-medium uppercase leading-5 tracking-widest text-zinc-500"
        >
          <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Survive 10 ideological challenges to unlock targeting.</span>
        </button>
      )}
      {error ? (
        <p className="mt-2 max-w-xs text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
