"use client";

import { DebateCard } from "@/app/feed/components/DebateCard";
import type { SocialFeedItem } from "@/lib/feed/types";

export function FeedTimeline({
  items,
  signedIn,
  viewerId,
  query,
}: {
  items: SocialFeedItem[];
  signedIn: boolean;
  viewerId: string | null;
  query?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-10 text-sm leading-6 text-zinc-400">
        {query
          ? `Nothing in the feed matches "${query}".`
          : signedIn
            ? "No backyard or arena debates in your districts yet."
            : "Sign in to see debates on your ballot and in your matched races."}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {items.map((item) => (
        <DebateCard key={`${item.loop}-${item.id}`} item={item} viewerId={viewerId} />
      ))}
    </section>
  );
}
