import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/app/components/search-bar";
import { CalibrationBanner } from "@/app/feed/components/CalibrationBanner";
import { DebateComposer } from "@/app/feed/components/DebateComposer";
import { InfiniteFeed } from "@/app/feed/components/InfiniteFeed";
import {
  answeredRedDebateCount,
  loadFeedViewer,
  loadHomeDebates,
  loadMatchedDebates,
  loadMatchedFloors,
  socialFeedPageFromSearch,
  socialFeedQueryFromSearch,
} from "@/lib/feed/load-social-feed";
import { mergeFeedTimeline, SOCIAL_FEED_PAGE_SIZE } from "@/lib/feed/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Civic Feed · WHERE 2 RUN",
  description: "Backyard debates on your physical ballot, and arena debates in races that match your ideology.",
};

export default async function FeedPage(props: PageProps<"/feed">) {
  const searchParams = await props.searchParams;
  const page = socialFeedPageFromSearch(searchParams);
  const q = socialFeedQueryFromSearch(searchParams);
  const limit = page * SOCIAL_FEED_PAGE_SIZE;
  const viewer = await loadFeedViewer();
  const hasBallot = viewer.homeOcdIds.length > 0 || viewer.matchedOcdIds.length > 0;
  if (viewer.userId && !hasBallot && viewer.districtId == null) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
          <Link
            href="/onboarding"
            className="block w-full rounded-xl border border-gold bg-zinc-900 px-6 py-8 shadow-[inset_3px_0_0_0_var(--gold-strong)] transition-colors hover:border-gold hover:bg-zinc-900/80"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
              Verify district
            </p>
            <p className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight text-parchment">
              Welcome! To unlock your live civic feed and voter matchmaking, please verify your
              local district.
            </p>
          </Link>
        </div>
      </main>
    );
  }

  const [floors, red, blue, answeredRed] = await Promise.all([
    loadMatchedFloors(viewer, limit, q),
    loadMatchedDebates(viewer, limit, q),
    loadHomeDebates(viewer, limit, q),
    answeredRedDebateCount(viewer),
  ]);
  const showCalibration = answeredRed != null && answeredRed < 5;
  // A race can be both home ballot and ideological match. Show that debate once,
  // as a Blue Card. Open floors lead the red lane: they are what a runner can act on.
  const blueIds = new Set(blue.items.map((item) => item.id));
  const redDebates = red.items.filter((item) => !blueIds.has(item.id));
  const items = mergeFeedTimeline([...floors.items, ...redDebates], blue.items);
  const error = items.length === 0 ? floors.error || red.error || blue.error : null;

  const districtLabel = viewer.districtName ?? "your district";

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        {showCalibration ? <CalibrationBanner /> : null}
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
            Blue cards are debates on your physical ballot. Red cards are debates in races that match your ideology.
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
            hasMore={floors.hasMore || red.hasMore || blue.hasMore}
            items={items}
            signedIn={Boolean(viewer.userId)}
            viewerId={viewer.userId}
          />
        )}
      </div>
    </main>
  );
}
