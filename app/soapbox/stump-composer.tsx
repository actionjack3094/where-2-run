"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSoapboxPost } from "@/lib/actions/soapbox";

const SPEECH_MAX = 280;

export function StumpComposer({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const remaining = SPEECH_MAX - content.length;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await createSoapboxPost(content);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setContent("");
    setMessage(result.message ?? "Posted.");
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
      <label className="flex flex-col gap-2" htmlFor="stump-speech">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-600">
          Post a Stump Speech
        </span>
        <textarea
          id="stump-speech"
          value={content}
          onChange={(event) => setContent(event.target.value.slice(0, SPEECH_MAX))}
          maxLength={SPEECH_MAX}
          rows={4}
          required
          placeholder="280 characters. Say the thing you are willing to defend."
          className="resize-none rounded-md border border-amber-500/30 bg-white px-3 py-3 text-sm leading-6 text-stone-900 outline-none placeholder:text-stone-400 focus:border-gold"
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-widest text-stone-600">{remaining} left</p>
        {signedIn ? (
          <button
            type="submit"
            disabled={pending || content.trim().length === 0}
            className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        ) : (
          <Link
            href="/auth/login?next=%2Fsoapbox"
            className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
          >
            Sign in to post
          </Link>
        )}
      </div>
      {error ? <p className="mt-3 text-sm leading-6 text-stone-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm leading-6 text-stone-900">{message}</p> : null}
    </form>
  );
}
