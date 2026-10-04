"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayName } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";

export function DisplayNameForm({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    setError(null);
    const result = await updateDisplayName(value);
    setPending(false);
    setMessage(result.message ?? null);
    setError(result.error ?? null);
    if (result.message) {
      window.dispatchEvent(new Event("where2run:identity"));
      router.refresh();
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <label className="grid gap-2 text-sm text-zinc-300" htmlFor="display-name">
        Display name
        <input
          id="display-name"
          required
          maxLength={48}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-12 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-parchment"
        />
      </label>
      <Button type="submit" variant="gold" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save name"}
      </Button>
      {message ? <p className="text-sm leading-6 text-parchment">{message}</p> : null}
      {error ? <p className="text-sm leading-6 text-zinc-300">{error}</p> : null}
    </form>
  );
}
