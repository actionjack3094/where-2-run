import type { Metadata } from "next";
import Link from "next/link";
import { CoalitionDesk } from "@/components/coalitions/CoalitionDesk";
import { loadCoalitionDirectory } from "@/lib/coalitions";

export const metadata: Metadata = {
  title: "Coalitions · WHERE 2 RUN",
  description:
    "Charter a political coalition, invite aligned campaigns, and discover endorsements by stance vector.",
};

export default async function CoalitionsPage() {
  const directory = await loadCoalitionDirectory();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            My Campaign
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Coalition Hub
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Seat alliances, send cross-district endorsements, and discover charters that match
            your stance vector.
          </p>
          <Link
            href="/my-campaign"
            className="mt-4 inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
          >
            Back to ideological engine
          </Link>
        </header>
        <CoalitionDesk directory={directory} />
      </div>
    </main>
  );
}
