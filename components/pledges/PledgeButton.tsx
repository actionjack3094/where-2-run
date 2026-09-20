"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";

const PLEDGE_AMOUNT = 50;

export function PledgeButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy || !candidateId) return;

    setBusy(true);
    setError(null);

    try {
      await ensureArenaUser();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/pledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          candidate_id: candidateId,
          amount: PLEDGE_AMOUNT,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not record the pledge.");
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not record the pledge.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy || !candidateId}
        className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-100 px-3 text-xs font-medium uppercase tracking-widest text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Pledging..." : "Pledge $50"}
      </button>
      {error ? <p className="max-w-[16rem] text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
