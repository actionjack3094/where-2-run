"use client";

import { DebateCard } from "@/app/feed/components/DebateCard";
import type { SocialFeedItem } from "@/lib/feed/types";

export function FeedTimeline({
  items,
  signedIn,
}: {
  items: SocialFeedItem[];
  signedIn: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-10 text-sm leading-6 text-zinc-400">
        {signedIn
          ? "No open candidate questions or jury debates in your districts yet."
          : "Sign in to see candidate questions and jury debates in your districts."}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {items.map((item) => (
        <DebateCard key={`${item.loop}-${item.id}`} item={item} />
      ))}
    </section>
  );
}
