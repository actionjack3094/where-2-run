"use client";

import Link from "next/link";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import type { SoapboxLens, SoapboxPost } from "@/components/soapbox/types";

function tierRank(post: SoapboxPost) {
  if (post.badge?.startsWith("CONTENDER")) return 0;
  if (post.badge?.startsWith("CHALLENGER")) return 1;
  if (post.badge?.startsWith("PROSPECT")) return 2;
  return 3;
}

function visiblePosts(posts: SoapboxPost[], tab: SoapboxLens, zip: string, district: string) {
  const scoped = posts.filter((post) => post.lens === tab);
  if (tab === "voter") {
    return scoped.filter(
      (post) => (zip.length === 5 && post.zip === zip) || post.district === district,
    );
  }
  return [...scoped].sort((a, b) => tierRank(a) - tierRank(b));
}

export function SoapboxFeed({
  posts,
  activeTab,
  homeZip,
  homeDistrict,
  onTakeMic,
}: {
  posts: SoapboxPost[];
  activeTab: SoapboxLens;
  homeZip: string;
  homeDistrict: string;
  onTakeMic: () => void;
}) {
  const feed = visiblePosts(posts, activeTab, homeZip, homeDistrict);

  if (activeTab === "voter" && feed.length === 0) {
    return (
      <article className="rounded-2xl border border-amber-200/70 bg-white p-6 text-center shadow-sm">
        <p className="text-sm leading-6 text-stone-700">
          The floor is open. No constituents in your district have spoken up yet. Be the first to take the mic.
        </p>
        <button
          type="button"
          onClick={onTakeMic}
          className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700"
        >
          Take the mic
        </button>
      </article>
    );
  }

  return (
    <ul className="grid gap-4">
      {feed.map((post) => (
        <li key={post.id} className="rounded-2xl border border-amber-200/70 bg-white p-6 shadow-sm">
          <Card post={post} />
        </li>
      ))}
    </ul>
  );
}

function Card({ post }: { post: SoapboxPost }) {
  const body = (
    <>
      <header className="flex items-center gap-3">
        <CandidateAvatar name={post.name} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-stone-900">{post.name}</p>
            {post.badge ? (
              <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-800">
                {post.badge}
              </span>
            ) : null}
          </div>
          {post.matchPercent != null ? (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-stone-500">
              {post.matchPercent}% match
            </p>
          ) : null}
        </div>
      </header>
      <p className="mt-4 text-sm leading-6 text-stone-800">{post.text}</p>
      {post.clip ? (
        <div className="mt-4 flex aspect-video items-center justify-center rounded-2xl bg-stone-900 text-[11px] font-medium uppercase tracking-widest text-white/80">
          Clip
        </div>
      ) : null}
    </>
  );
  if (!post.href) return body;
  return (
    <Link href={post.href} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700">
      {body}
    </Link>
  );
}
