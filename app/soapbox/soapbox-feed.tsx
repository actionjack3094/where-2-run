"use client";

import { useEffect, useRef, useState } from "react";
import { SoapboxPreviewCard } from "@/app/soapbox/soapbox-card";
import { SubNavTabs } from "@/components/ui/SubNavTabs";

type FeedScope = "sphere" | "national";

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
  const source = scope === "sphere" ? LOCAL : TRENDING;
  return Array.from({ length: count }, (_, index) => {
    const post = source[index % source.length];
    return { ...post, key: `${scope}-${index}` };
  });
}

export function SoapboxFeed({ localEnabled }: { localEnabled: boolean }) {
  const [scope, setScope] = useState<FeedScope>("sphere");
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
    setScope(next);
    setVisible(PAGE_SIZE + 1);
  }

  const cards = cardsFor(scope, visible);

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-center px-4">
          <SubNavTabs
            label="Soapbox feed"
            items={[
              { id: "sphere", label: "My Sphere" },
              { id: "national", label: "All Primaries" },
            ]}
            activeTab={scope}
            onChange={(id) => {
              if (id === "sphere" || id === "national") select(id);
            }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col" data-feed-scope={scope}>
        {scope === "sphere" && !localEnabled ? (
          <p className="px-4 py-8 text-sm leading-6 text-stone-600">
            My Sphere shows peers and voters in your matched races. Finish onboarding with a voting ZIP code to open it.
          </p>
        ) : null}
        {scope === "national" || localEnabled
          ? cards.map((post) => <SoapboxPreviewCard key={post.key} post={post} />)
          : null}
        {scope === "sphere" && !localEnabled ? null : visible < PREVIEW_CAP ? (
          <div ref={sentinel} className="h-16" aria-hidden />
        ) : (
          <p className="px-4 py-8 text-center text-sm text-stone-500">You&apos;re up to date on this preview.</p>
        )}
      </div>
    </div>
  );
}
