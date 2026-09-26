"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FeedTimeline } from "@/app/feed/components/FeedTimeline";
import type { SocialFeedItem } from "@/lib/feed/types";

export function InfiniteFeed({
  page,
  query,
  hasMore,
  items,
  signedIn,
}: {
  page: number;
  query?: string;
  hasMore: boolean;
  items: SocialFeedItem[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isPending) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        startTransition(() => {
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          params.set("page", String(page + 1));
          router.push(`/feed?${params.toString()}`, { scroll: false });
        });
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isPending, page, query, router]);

  return (
    <div className="mt-8 pb-16">
      <FeedTimeline items={items} signedIn={signedIn} query={query} />
      <div ref={sentinelRef} aria-hidden className="h-8 w-full" />
      {isPending ? (
        <p className="mt-2 text-center text-xs uppercase tracking-widest text-zinc-500">
          Loading older posts…
        </p>
      ) : null}
      {!hasMore && items.length > 0 ? (
        <p className="mt-2 text-center text-xs uppercase tracking-widest text-zinc-500">
          You are caught up.
        </p>
      ) : null}
    </div>
  );
}
