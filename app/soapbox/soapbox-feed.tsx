"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

type FeedScope = "trending" | "local";

type MockPost = {
  name: string;
  handle: string;
  text: string;
  video: "wide" | "tall" | null;
};

const TRENDING: MockPost[] = [
  {
    name: "Avery Chen",
    handle: "avery",
    text: "Placeholder stump: housing costs are the race. Say what you would actually change in the first session.",
    video: null,
  },
  {
    name: "Jordan Hale",
    handle: "jhale",
    text: "Placeholder clip. A 20-second answer on transit, filmed walking a district street.",
    video: "wide",
  },
  {
    name: "Mina Ortiz",
    handle: "mina",
    text: "Placeholder: the local hospital levy is the quiet vote on this ballot. Here is the one-minute version.",
    video: "tall",
  },
  {
    name: "Chris Patel",
    handle: "cpatel",
    text: "Placeholder text post. No video — just a stance you can challenge from the floor.",
    video: null,
  },
];

const LOCAL: MockPost[] = [
  {
    name: "Neighborhood desk",
    handle: "yourzip",
    text: "Placeholder local post. This card stands in for a speech filed inside your ZIP.",
    video: null,
  },
  {
    name: "Ward reporter",
    handle: "block",
    text: "Placeholder local clip. A candidate answering a question from the precinct meeting.",
    video: "tall",
  },
  {
    name: "School board watch",
    handle: "local",
    text: "Placeholder: the bond measure, explained in one pass for people who live here.",
    video: "wide",
  },
];

const PAGE_SIZE = 3;
const PREVIEW_CAP = 15;

function cardsFor(scope: FeedScope, count: number) {
  const source = scope === "local" ? LOCAL : TRENDING;
  return Array.from({ length: count }, (_, index) => {
    const post = source[index % source.length];
    return { ...post, key: `${scope}-${index}` };
  });
}

export function SoapboxFeed({ localEnabled }: { localEnabled: boolean }) {
  const [scope, setScope] = useState<FeedScope>("trending");
  const [visible, setVisible] = useState(PAGE_SIZE + 1);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || visible >= PREVIEW_CAP) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible((count) => Math.min(count + PAGE_SIZE, PREVIEW_CAP));
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scope, visible]);

  function select(next: FeedScope) {
    if (next === "local" && !localEnabled) return;
    setScope(next);
    setVisible(PAGE_SIZE + 1);
  }

  const cards = cardsFor(scope, visible);

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-center px-4">
          <div role="tablist" aria-label="Soapbox feed" className="inline-flex rounded-full bg-stone-200/80 p-1">
            <button
              type="button"
              role="tab"
              aria-selected={scope === "trending"}
              className={cn(
                "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
                scope === "trending" ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
              )}
              onClick={() => select("trending")}
            >
              Trending
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "local"}
              disabled={!localEnabled}
              title={
                localEnabled
                  ? "Posts from your ZIP code"
                  : "Finish Townhall onboarding with a ZIP code to open Local"
              }
              className={cn(
                "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
                localEnabled
                  ? scope === "local"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                  : "cursor-not-allowed text-stone-400",
              )}
              onClick={() => select("local")}
            >
              Local
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col" data-feed-scope={scope}>
        {cards.map((post) => (
          <article key={post.key} className="border-b border-stone-200 px-4 py-5">
            <div className="flex gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600"
                aria-hidden
              >
                {post.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-5">
                  <span className="font-semibold text-stone-900">{post.name}</span>{" "}
                  <span className="text-stone-500">@{post.handle}</span>
                </p>
                <p className="mt-2 text-[15px] leading-6 text-stone-800">{post.text}</p>
                {post.video ? (
                  <div
                    className={cn(
                      "relative mt-3 flex items-center justify-center overflow-hidden rounded-2xl bg-stone-900",
                      post.video === "tall" ? "aspect-[9/14]" : "aspect-video",
                    )}
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-stone-900">
                      <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
                      <span className="sr-only">Video placeholder</span>
                    </span>
                    <p className="absolute bottom-3 left-3 text-xs font-medium uppercase tracking-widest text-white/80">
                      Video
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {visible < PREVIEW_CAP ? (
          <div ref={sentinel} className="h-16" aria-hidden />
        ) : (
          <p className="px-4 py-8 text-center text-sm text-stone-500">You&apos;re up to date on this preview.</p>
        )}
      </div>
    </div>
  );
}
