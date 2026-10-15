"use client";

import { useActionState } from "react";
import { fileVotingZip } from "@/lib/actions/onboarding-diagnostic";

export function ZipForm() {
  const [state, action, pending] = useActionState(
    async (_previous: { error?: string } | null, formData: FormData) => fileVotingZip(formData),
    null,
  );

  return (
    <form action={action} className="mt-8 grid max-w-sm gap-3">
      <label className="grid gap-2 text-sm text-stone-700">
        Voting ZIP code
        <input
          name="zip"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          pattern="[0-9]{5}"
          maxLength={5}
          placeholder="78701"
          className="h-11 rounded-lg border border-amber-500/30 bg-white px-3 text-stone-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-gold-strong px-5 text-[11px] font-semibold uppercase tracking-widest text-stone-900 disabled:opacity-60"
      >
        {pending ? "Saving…" : "See matched primaries"}
      </button>
      {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}
