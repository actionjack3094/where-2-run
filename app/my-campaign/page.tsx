import Link from "next/link";
import { redirect } from "next/navigation";
import { ArenaProvingGround } from "@/components/campaign/ArenaProvingGround";
import { MatchedElections } from "@/components/campaign/MatchedElections";
import { getServerUser } from "@/lib/db/supabase-server";
import { loadWarRoom } from "@/lib/war-room";
import { BallotAccessRoadmap } from "./components/BallotAccessRoadmap";
import { EscrowTable } from "./components/EscrowTable";
import { MatchmakerFeed } from "./components/MatchmakerFeed";
import { WarRoomMetrics } from "./components/WarRoomMetrics";
import { IdeologicalEngine } from "./ideological-engine";

export default async function MyCampaignPage() {
  const user = await getServerUser();
  if (!user) {
    redirect("/onboarding");
  }

  const { metrics, escrow } = await loadWarRoom(user.id);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col overflow-x-hidden bg-zinc-950 text-zinc-100">
      <section className="mx-auto w-full max-w-5xl px-6 pt-10">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Private desk
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            War Room
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Escrow, ELO, and the three districts whose median voter sits closest
            to this ticket.
          </p>
        </header>
        <div className="mt-8">
          <WarRoomMetrics metrics={metrics} />
        </div>
        <MatchmakerFeed />
        <EscrowTable rows={escrow} />
      </section>

      <IdeologicalEngine />

      <section
        aria-label="Campaign management tools"
        className="mx-auto w-full max-w-5xl px-6 pb-16"
      >
        <div className="border-t border-gold/30 pt-12">
          <ArenaProvingGround />
          <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Identity
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
                Verification & Civic Fencing
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Confirm a phone, match the voter file, then file a government ID for
                ballot access.
              </p>
            </div>
            <Link
              href="/my-campaign/verify"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-parchment transition-colors hover:border-gold hover:bg-zinc-900"
            >
              Open Verification Hub
            </Link>
          </div>
          <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Alliances
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment">
                Coalitions & Endorsements
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Charter a caucus and invite aligned campaigns across districts.
              </p>
            </div>
            <Link
              href="/my-campaign/coalitions"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold"
            >
              Open Coalition Hub
            </Link>
          </div>
          <BallotAccessRoadmap />
          <MatchedElections />
        </div>
      </section>
    </main>
  );
}
