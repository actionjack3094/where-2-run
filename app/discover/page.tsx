import type { Metadata } from "next";
import { DiscoveryFeed } from "@/app/discover/discovery-feed";
import { loadDiscoveryDebates } from "@/lib/actions/debates";

export const metadata: Metadata = {
  title: "Discover · WHERE 2 RUN",
  description: "Live, judged, and open debates across every district.",
};

export default async function DiscoverPage() {
  const { debates, error } = await loadDiscoveryDebates();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Every district
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Discover
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Debates from every OCD division, busiest floors first and the newest
            matches after that.
          </p>
        </header>

        {error ? <p className="mt-8 text-sm leading-6 text-zinc-400">{error}</p> : null}
        {error ? null : <DiscoveryFeed debates={debates} />}
      </div>
    </main>
  );
}
