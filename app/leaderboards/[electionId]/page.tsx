import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EndorsementBadge } from "@/components/coalitions/EndorsementBadge";
import { isUuid } from "@/lib/arena/display";
import {
  ALIGNMENT_STREAK_GOAL,
  getDistrictLeaderboard,
  type DistrictLeaderboardEntry,
} from "@/lib/queries/leaderboard";
import { formatUsd } from "@/lib/pledges";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ electionId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { electionId } = await params;
  const board = await getDistrictLeaderboard(electionId);
  return {
    title: board.election
      ? `${board.election.label} · Leaderboard · WHERE 2 RUN`
      : "Leaderboard · WHERE 2 RUN",
    description: board.election
      ? `Declared candidates in ${board.election.label}, ranked by Elo, alignment streak, and pledged escrow.`
      : "District leaderboard on WHERE 2 RUN.",
  };
}

export default async function DistrictLeaderboardPage({ params }: PageProps) {
  const { electionId } = await params;
  if (!isUuid(electionId)) notFound();

  const board = await getDistrictLeaderboard(electionId);
  if (!board.election) notFound();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            District leaderboard
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            {board.election.label}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Declared candidates in {board.election.officeName}, ranked by Elo. Escrow and
            alignment streak show current campaign momentum.
          </p>
          <Link
            href="/leaderboards?all=1"
            className="mt-4 inline-block text-[11px] font-medium uppercase tracking-widest text-gold hover:text-parchment"
          >
            All races
          </Link>
        </header>

        {board.error ? (
          <p className="mt-10 text-sm leading-6 text-rose-300" role="alert">
            Could not load this board. {board.error}
          </p>
        ) : board.rankings.length === 0 ? (
          <p className="mt-10 text-sm leading-6 text-zinc-400">
            No candidates have declared in this race yet.
          </p>
        ) : (
          <ol className="mt-10 flex flex-col gap-4">
            {board.rankings.map((entry) => (
              <li key={entry.id}>
                <CandidateRow entry={entry} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

function CandidateRow({ entry }: { entry: DistrictLeaderboardEntry }) {
  const streak = Math.min(entry.alignmentStreak, ALIGNMENT_STREAK_GOAL);
  const streakPct = (streak / ALIGNMENT_STREAK_GOAL) * 100;

  return (
    <article className="rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
      <div className="flex items-start gap-4">
        <p className="w-10 shrink-0 font-display text-2xl tabular-nums text-gold">#{entry.rank}</p>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/candidate/${entry.id}`}
                className="font-display text-xl font-semibold tracking-tight text-parchment hover:text-gold"
              >
                {entry.name}
              </Link>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                {entry.elo} ELO
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold tabular-nums text-gold">
                {formatUsd(entry.escrowTotal)}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                locked
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                Alignment streak
              </p>
              <p className="font-display text-sm font-semibold tabular-nums text-parchment">
                {entry.alignmentStreak}/{ALIGNMENT_STREAK_GOAL}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label={`${entry.name} alignment streak`}
              aria-valuemin={0}
              aria-valuemax={ALIGNMENT_STREAK_GOAL}
              aria-valuenow={streak}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
            >
              <div
                className={cn("h-full rounded-full bg-gold-strong")}
                style={{ width: `${streakPct}%` }}
              />
            </div>
          </div>

          <EndorsementBadge count={entry.endorsements} className="mt-4" />
        </div>
      </div>
    </article>
  );
}
