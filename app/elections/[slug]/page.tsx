import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComplianceDossier } from "@/app/elections/components/ComplianceDossier";
import { DebateQueue } from "@/app/elections/components/DebateQueue";
import { DraftLeaderboard } from "@/app/elections/components/DraftLeaderboard";
import { IdeologicalBenchmark } from "@/app/elections/components/IdeologicalBenchmark";
import { formatUsd } from "@/lib/pledges";
import { loadElectionHub } from "@/lib/elections";

type ElectionPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ElectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { hub } = await loadElectionHub(slug);
  const office = hub?.election.office_name;

  return {
    title: office ? `${office} · Elections · WHERE 2 RUN` : "Election · WHERE 2 RUN",
    description: office
      ? `Median voter, draft field, ballot-access rules, and policy debates for ${office}.`
      : "Election hub on WHERE 2 RUN.",
  };
}

export default async function ElectionPage({ params }: ElectionPageProps) {
  const { slug } = await params;
  const { hub, error } = await loadElectionHub(slug);

  if (error) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not load this election. {error}
          </p>
        </div>
      </main>
    );
  }

  if (!hub) {
    notFound();
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Election hub
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment sm:text-4xl">
            {hub.election.office_name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            {hub.election.incumbent_name
              ? `Incumbent ${hub.election.incumbent_name}. `
              : "Open or unpublished incumbent. "}
            {hub.escrowCount > 0
              ? `${formatUsd(hub.escrowTotal)} in vaulted escrow across ${hub.escrowCount} ${hub.escrowCount === 1 ? "pledge" : "pledges"}.`
              : "No vaulted escrow on this race yet."}
          </p>
        </header>

        <IdeologicalBenchmark
          median={hub.medianVector}
          candidates={hub.candidates}
          officeName={hub.election.office_name}
        />
        <DraftLeaderboard candidates={hub.candidates} />
        <ComplianceDossier election={hub.election} />
        <DebateQueue
          debates={hub.debates}
          pledges={hub.pledges}
          escrowTotal={hub.escrowTotal}
          electionId={hub.election.id}
          electionSlug={hub.election.slug}
          officeName={hub.election.office_name}
        />
      </div>
    </main>
  );
}
