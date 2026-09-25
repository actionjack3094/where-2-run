"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimQuestionFloor } from "@/app/actions/feed/claim-floor";
import { supabase } from "@/lib/db/supabase";

async function sessionToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function actionError(result: { error?: string } | { debateId: string }) {
  return "error" in result ? result.error ?? "Could not update this floor." : null;
}

export function TakeStanceButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takeStance() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const token = await sessionToken();
      if (!token) {
        setError("Sign in to take a stance.");
        return;
      }
      const result = await claimQuestionFloor({ questionId }, token);
      const message = actionError(result);
      if (message) {
        setError(message);
        return;
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not take the floor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => void takeStance()}
        className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-gold-strong px-4 text-xs font-medium uppercase tracking-widest text-zinc-950 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Recording stance…" : "Take the floor"}
      </button>
      {error ? (
        <p className="text-sm leading-6 text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ChallengeOpponentButton({
  questionId,
  debateId,
}: {
  questionId: string;
  debateId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function challenge() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const token = await sessionToken();
      if (!token) {
        setError("Sign in to challenge this opponent.");
        return;
      }
      const result = await claimQuestionFloor({ questionId, debateId }, token);
      const message = actionError(result);
      if (message) {
        setError(message);
        return;
      }
      if ("debateId" in result) {
        router.push(`/debates/${result.debateId}`);
        return;
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not challenge this opponent.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void challenge()}
        className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-red-600 px-4 text-xs font-medium uppercase tracking-widest text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Challenging…" : "CHALLENGE OPPONENT"}
      </button>
      {error ? (
        <p className="text-sm leading-6 text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
