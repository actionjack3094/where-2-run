import type { Metadata } from "next";
import { BallotCard } from "@/app/ballot/ballot-card";
import { BallotZipGate } from "@/app/ballot/zip-gate";
import { electionsTabs, LaneTabs } from "@/components/lane-tabs";
import { loadMyBallotFeed } from "@/lib/ballot/load-district-feed";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Voter Ballot · WHERE 2 RUN",
  description: "Races on your registered home district, for voting and pledging.",
};

export default async function BallotPage() {
  const user = await getServerUser();
  const feed = await loadMyBallotFeed(user?.id ?? null);
  const locked = feed.signedOut || feed.needsZip;

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4">
          <h1
            className="text-sm font-semibold text-stone-900"
            style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
          >
            My Voter Ballot
          </h1>
          {feed.districtLabel ? (
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500">{feed.districtLabel}</p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-4">
        <LaneTabs label="Elections" tabs={electionsTabs("ballot")} />
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        {feed.notice ? (
          <p className="border-b border-stone-200 px-4 py-3 text-sm leading-6 text-stone-600">{feed.notice}</p>
        ) : null}
        {locked ? <BallotZipGate signedOut={feed.signedOut} /> : null}
        {!locked && feed.cards.length === 0 ? (
          <p className="px-4 py-16 text-sm leading-6 text-stone-600">
            No active debates or policy statements in {feed.districtLabel ?? "your district"} yet.
          </p>
        ) : null}
        {feed.cards.map((card) => (
          <BallotCard key={`${card.kind}:${card.id}`} card={card} signedIn={Boolean(user)} />
        ))}
      </div>
    </main>
  );
}
