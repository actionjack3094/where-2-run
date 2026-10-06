"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { castSoapboxVote } from "@/lib/actions/soapbox";
import { MatchConfidence } from "@/components/ballot/MatchConfidence";

export function SoapboxSnippet({
  postId,
  authorId,
  authorName,
  text,
  likes,
  matchPercent,
  stale,
  signedIn,
}: {
  postId: string;
  authorId: string;
  authorName: string;
  text: string;
  likes: number;
  matchPercent: number | null;
  stale: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Soapbox</p>
      <p className="mt-3 text-sm font-medium text-parchment">
        <Link href={`/profile/${authorId}`} className="hover:text-gold">
          {authorName}
        </Link>
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
      {matchPercent != null ? <MatchConfidence percent={matchPercent} stale={stale} /> : null}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={!signedIn || pending}
          onClick={() => {
            setPending(true);
            setError(null);
            void castSoapboxVote(postId, 1).then((result) => {
              setPending(false);
              if (result.error) setError(result.error);
              else router.refresh();
            });
          }}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-200 disabled:opacity-50"
        >
          Like {likes}
        </button>
        <p className="text-[11px] uppercase tracking-widest text-zinc-500">
          Likes widen reach. Civic Standing stays put.
        </p>
      </div>
      {error ? <p className="mt-2 text-sm text-zinc-300">{error}</p> : null}
    </article>
  );
}
