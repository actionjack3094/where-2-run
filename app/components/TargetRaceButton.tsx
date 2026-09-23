"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";

export function TargetRaceButton({
  election_id,
  className,
}: {
  election_id: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function targetRace() {
    if (busy || saved) return;
    setBusy(true);
    setError(null);
    try {
      const arenaUser = await ensureArenaUser();
      const { error: insertError } = await supabase.from("campaign_targets").upsert(
        {
          user_id: arenaUser.id,
          election_id,
          status: "exploring",
        },
        { onConflict: "user_id,election_id", ignoreDuplicates: true },
      );
      if (insertError) throw new Error(insertError.message);
      setSaved(true);
      setToast("Race added to your Campaign Hub.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not target this race.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={cn(className)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || saved}
          onClick={() => void targetRace()}
        >
          {saved ? "Targeted" : busy ? "Adding…" : "Target this race"}
        </Button>
        {error ? (
          <p className="mt-2 max-w-xs text-sm leading-6 text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {toast ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
        >
          <p className="rounded-full border border-gold/50 bg-zinc-950 px-4 py-2 text-sm text-parchment shadow-lg">
            {toast}
          </p>
        </div>
      ) : null}
    </>
  );
}
