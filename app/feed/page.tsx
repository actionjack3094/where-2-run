import type { Metadata } from "next";
import { DebateComposer } from "@/app/feed/components/DebateComposer";
import { InfiniteFeed } from "@/app/feed/components/InfiniteFeed";
import {
  loadSocialFeed,
  socialFeedPageFromSearch,
} from "@/lib/feed/load-social-feed";

export const metadata: Metadata = {
  title: "Civic Feed · WHERE 2 RUN",
  description: "Endless district debates, open stances, and a live ideology composer.",
};

export default async function FeedPage(props: PageProps<"/feed">) {
  const query = await props.searchParams;
  const page = socialFeedPageFromSearch(query);
  const feed = await loadSocialFeed(page);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Civic Feed
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-parchment">
            Endless Social Feed
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            File a stance, get assigned to a race, and keep scrolling older debates.
          </p>
        </header>

        <DebateComposer />

        {feed.error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{feed.error}</p>
        ) : (
          <InfiniteFeed
            page={feed.page}
            hasMore={feed.hasMore}
            items={feed.items}
            viewerTier={feed.viewerTier}
            viewerOcdIdentifiers={feed.viewerOcdIdentifiers}
          />
        )}
      </div>
    </main>
  );
}
