import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JuryVerdictPanel } from "@/components/debates/JuryVerdictPanel";
import { RoundTranscript } from "@/components/debates/RoundTranscript";
import { isUuid } from "@/lib/arena/display";
import { getServerUser } from "@/lib/db/supabase-server";
import { loadJuryDesk } from "@/lib/jury-desk";
import { displayTally } from "@/lib/vote-weight";

type JuryPageProps = {
  params: Promise<{ appealId: string }>;
};

export const metadata: Metadata = {
  title: "Spectator Jury · WHERE 2 RUN",
  description: "Review the contested debate and cast a local jury verdict.",
};

export default async function SpectatorJuryPage({ params }: JuryPageProps) {
  const { appealId } = await params;
  if (!isUuid(appealId)) notFound();

  const user = await getServerUser();
  const desk = await loadJuryDesk(appealId, user?.id ?? null);
  if (!desk) notFound();

  const tally = displayTally(
    { a: desk.debate.candidate_a_votes, b: desk.debate.candidate_b_votes },
    {
      a: desk.debate.candidate_a_weighted_votes ?? 0,
      b: desk.debate.candidate_b_weighted_votes ?? 0,
    },
  );

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10 pb-16">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href="/spectator/jury"
            className="text-xs font-medium uppercase tracking-widest text-zinc-400 hover:text-parchment"
          >
            ← Jury Duty
          </Link>
          <Link
            href={`/debates/${desk.debate.id}`}
            className="text-xs font-medium uppercase tracking-widest text-zinc-400 hover:text-parchment"
          >
            Debate
          </Link>
        </div>
        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Spectator jury
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-parchment">
            {desk.prompt || "Untitled question"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Recorded winner: {desk.winnerLabel}. {desk.candidateAName} vs {desk.candidateBName}.
            {desk.appellantName ? ` Appealed by ${desk.appellantName}.` : ""}
          </p>
        </header>

        <section className="mt-8 rounded-xl border border-gold/40 bg-zinc-900 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            Grounds
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-parchment">
            {desk.appeal.reason?.trim() || "No written grounds were filed."}
          </p>
        </section>

        <section aria-label="Debate transcript" className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Transcript
          </h2>
          <div className="mt-4">
            <RoundTranscript
              rounds={desk.rounds}
              candidateAName={desk.candidateAName}
              candidateBName={desk.candidateBName}
              aVotes={tally.primary.a}
              bVotes={tally.primary.b}
              weighted={tally.weighted}
              layout="split"
            />
          </div>
        </section>

        <div className="mt-8">
          <JuryVerdictPanel
            appealId={desk.appeal.id}
            eligibility={desk.eligibility}
            ownVerdict={desk.ownVerdict}
            status={desk.appeal.status ?? "pending"}
            verdicts={desk.verdicts}
            overturnedVotes={desk.overturnedVotes}
            quorum={desk.quorum}
          />
        </div>
      </div>
    </main>
  );
}
