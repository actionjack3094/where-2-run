import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadElectionDirectory } from "@/lib/elections";

export const metadata: Metadata = {
  title: "Elections · WHERE 2 RUN",
  description:
    "Open an election hub: median voter, draft field, ballot-access dossier, and the debate queue.",
};

export default async function ElectionsIndexPage() {
  const { elections, error } = await loadElectionDirectory();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Ballot
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Elections
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Each race has a median-voter benchmark, a draft leaderboard, the
            clerk&apos;s compliance dossier, and the policy prompts assigned to
            that seat.
          </p>
        </header>

        {error ? (
          <p className="mt-12 text-sm leading-6 text-zinc-400">
            Could not load elections. {error}
          </p>
        ) : elections.length === 0 ? (
          <Card className="mt-12">
            <CardHeader>
              <CardTitle>No elections on the map</CardTitle>
              <CardDescription>
                Apply the elections hub migration, then reload this directory.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {elections.map((election) => (
              <li key={election.id}>
                <Link href={`/elections/${election.slug}`} className="block h-full">
                  <article className="flex h-full flex-col rounded-xl border border-gold/40 bg-zinc-900 p-5 transition-colors hover:border-gold">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
                      {election.incumbent_name
                        ? `Incumbent · ${election.incumbent_name}`
                        : "Open seat"}
                    </p>
                    <h2 className="mt-2 font-display text-lg font-semibold leading-snug tracking-tight text-parchment">
                      {election.office_name}
                    </h2>
                    <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      {election.candidateCount}{" "}
                      {election.candidateCount === 1 ? "candidate" : "candidates"}
                      {" · "}
                      {election.debateCount}{" "}
                      {election.debateCount === 1 ? "prompt" : "prompts"}
                    </p>
                  </article>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
