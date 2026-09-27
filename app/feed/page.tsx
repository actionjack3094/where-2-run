import type { Metadata } from "next";
import { SearchBar } from "@/app/components/search-bar";
import { DebateComposer } from "@/app/feed/components/DebateComposer";
import { InfiniteFeed } from "@/app/feed/components/InfiniteFeed";
import {
  loadCandidateQuestions,
  loadFeedViewer,
  loadJuryDebates,
  socialFeedPageFromSearch,
  socialFeedQueryFromSearch,
} from "@/lib/feed/load-social-feed";
import { mergeFeedTimeline, SOCIAL_FEED_PAGE_SIZE } from "@/lib/feed/types";

export const metadata: Metadata = {
  title: "Civic Feed · WHERE 2 RUN",
  description: "Candidate questions you can still answer, and jury debates in your verified districts.",
};

export default async function FeedPage(props: PageProps<"/feed">) {
  const searchParams = await props.searchParams;
  const page = socialFeedPageFromSearch(searchParams);
  const q = socialFeedQueryFromSearch(searchParams);
  const limit = page * SOCIAL_FEED_PAGE_SIZE;
  const viewer = await loadFeedViewer();
  const [red, blue] = await Promise.all([
    loadCandidateQuestions(viewer, limit, q),
    loadJuryDebates(viewer, limit, q),
  ]);
  const items = mergeFeedTimeline(red.items, blue.items);
  const error = items.length === 0 ? red.error || blue.error : null;

  const districtLabel = viewer.districtName ?? "your district";

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <div className="mb-8 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-4 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            Local Context
          </p>
          <p className="mt-2 text-sm leading-6 text-parchment">
            Viewing live activity for: {districtLabel}
          </p>
        </div>

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

        <div className="mt-8">
          <SearchBar placeholder="Search..." />
        </div>

        <DebateComposer />

        {error ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">{error}</p>
        ) : (
          <InfiniteFeed
            page={page}
            query={q}
            hasMore={red.hasMore || blue.hasMore}
            items={items}
            signedIn={Boolean(viewer.userId)}
          />
        )}
      </div>
    </main>
  );
}
