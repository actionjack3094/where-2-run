import type { Metadata } from "next";
import { DebateComposer } from "@/app/feed/components/DebateComposer";
import { InfiniteFeed } from "@/app/feed/components/InfiniteFeed";
import {
  loadCandidateQuestions,
  loadFeedViewer,
  loadJuryDebates,
  socialFeedPageFromSearch,
} from "@/lib/feed/load-social-feed";
import { mergeFeedTimeline, SOCIAL_FEED_PAGE_SIZE } from "@/lib/feed/types";

export const metadata: Metadata = {
  title: "Civic Feed · WHERE 2 RUN",
  description: "Candidate questions you can still answer, and jury debates in your verified districts.",
};

export default async function FeedPage(props: PageProps<"/feed">) {
  const query = await props.searchParams;
  const page = socialFeedPageFromSearch(query);
  const limit = page * SOCIAL_FEED_PAGE_SIZE;
  const viewer = await loadFeedViewer();
  const [red, blue] = await Promise.all([
    loadCandidateQuestions(viewer, limit),
    loadJuryDebates(viewer, limit),
  ]);
  const items = mergeFeedTimeline(red.items, blue.items);
  const error = items.length === 0 ? red.error || blue.error : null;

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
            Answer open questions in races you can win, and judge debates in districts you have verified.
          </p>
        </header>

        <DebateComposer />

        {error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{error}</p>
        ) : (
          <InfiniteFeed
            page={page}
            hasMore={red.hasMore || blue.hasMore}
            items={items}
            signedIn={Boolean(viewer.userId)}
          />
        )}
      </div>
    </main>
  );
}
