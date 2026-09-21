import type { Metadata } from "next";
import { BallotFeed } from "@/components/feed/BallotFeed";

export const metadata: Metadata = {
  title: "My Ballot Feed · WHERE 2 RUN",
  description: "District debates and open challenges in one civic feed.",
};

export default function FeedPage() {
  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Civic Feed
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-parchment">
            My Ballot Feed
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            District debates you can watch, and open challenges in races you can enter.
          </p>
        </header>
        <BallotFeed />
      </div>
    </main>
  );
}
