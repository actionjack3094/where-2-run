"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dropOutOfPrimary } from "@/lib/actions/institutional";

export function DropoutButton({ primaryId }: { primaryId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-8">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          setMessage(null);
          setError(null);
          void dropOutOfPrimary(primaryId).then((result) => {
            setPending(false);
            setMessage(result.message ?? null);
            setError(result.error ?? null);
            if (!result.error) router.refresh();
          });
        }}
        className="rounded-md border border-amber-500/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-stone-700 disabled:opacity-50"
      >
        {pending ? "Closing…" : "Drop out"}
      </button>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Uncaptured pledges return as Civic Credit. Nothing is sent through a card charge.
      </p>
      {message ? <p className="mt-2 text-sm text-stone-900">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-stone-600">{error}</p> : null}
    </div>
  );
}
