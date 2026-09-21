import { getRoadmapTimers } from "@/app/actions/roadmap";
import { requireActionUserId } from "@/lib/arena/auth";
import { BallotAccessRoadmapView } from "./BallotAccessRoadmapView";

export async function BallotAccessRoadmap() {
  let userId: string | null = null;
  try {
    userId = await requireActionUserId();
  } catch {
    userId = null;
  }

  if (!userId) {
    return (
      <section aria-labelledby="ballot-access-roadmap-heading" className="mb-16">
        <RoadmapHeader />
        <div className="mt-8">
          <BallotAccessRoadmapView />
        </div>
      </section>
    );
  }

  let timers = null;
  try {
    timers = await getRoadmapTimers(userId);
  } catch {
    return (
      <section aria-labelledby="ballot-access-roadmap-heading" className="mb-16">
        <RoadmapHeader />
        <div className="mt-8">
          <BallotAccessRoadmapView />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="ballot-access-roadmap-heading" className="mb-16">
      <RoadmapHeader />
      <div className="mt-8">
        <BallotAccessRoadmapView initial={timers} resolvedUser />
      </div>
    </section>
  );
}

function RoadmapHeader() {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        Filing Board
      </p>
      <h2
        id="ballot-access-roadmap-heading"
        className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment"
      >
        Ballot Access Roadmap
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
        Countdown to residency and filing for your strongest matched race, with
        tokenized escrow plotted against the seat's goal.
      </p>
    </header>
  );
}
