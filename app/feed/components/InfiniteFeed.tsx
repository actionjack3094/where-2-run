"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FeedTimeline } from "@/app/feed/components/FeedTimeline";
import type { SocialFeedItem } from "@/lib/feed/types";
import type { VerificationTier } from "@/types/database.types";

export function InfiniteFeed({
  page,
  hasMore,
  items,
  viewerTier,
}: {
  page: number;
  hasMore: boolean;
  items: SocialFeedItem[];
  viewerTier: VerificationTier;
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
          router.push(`/feed?page=${page + 1}`, { scroll: false });
        });
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isPending, page, router]);

  return (
    <div className="mt-8 pb-16">
      <FeedTimeline items={items} viewerTier={viewerTier} />
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
