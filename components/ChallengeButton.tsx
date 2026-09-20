"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";

export function ChallengeButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy || !postId) return;

    setBusy(true);
    setError(null);

    try {
      await ensureArenaUser();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch("/api/arena/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ post_id: postId }),
      });
      const payload = (await response.json()) as {
        match_id?: string;
        error?: string;
      };

      if (!response.ok || !payload.match_id) {
        throw new Error(payload.error ?? "Could not start the challenge.");
      }

      router.push(`/arena/${payload.match_id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start the challenge.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy || !postId}
        className="inline-flex h-9 items-center justify-center rounded-md border border-red-900/80 bg-red-950/60 px-3 text-xs font-medium uppercase tracking-widest text-red-300 transition-colors hover:bg-red-950 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Challenging..." : "Challenge"}
      </button>
      {error ? <p className="max-w-[16rem] text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
