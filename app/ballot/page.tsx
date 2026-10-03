import type { Metadata } from "next";
import Link from "next/link";
import { BallotEngage } from "@/components/platform/ArenaForms";
import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { TownHall } from "@/components/platform/TownHall";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { loadBallot } from "@/lib/platform/queries";
import { loadProfile, platformAdmin } from "@/lib/platform/records";
import { loadTownHalls } from "@/lib/platform/town-hall";
import { tierLabel } from "@/lib/platform/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Ballot · WHERE 2 RUN",
  description: "View-only debates on your verified ballot.",
};

function raceLabel(state: string, district: string | null, office: string) {
  const seat = district ? `${state}-${district}` : state;
  return `${seat} · ${office}`;
}

export default async function BallotPage() {
  const user = await getServerUser();
  let board: Awaited<ReturnType<typeof loadBallot>> | null = null;
  let setup: string | null = null;
  let verified = false;
  try {
    board = await loadBallot(user?.id ?? null);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load My Ballot.";
    setup = isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message;
  }
  if (user && board) {
    try {
      const profile = await loadProfile(platformAdmin(), user.id);
      verified = Boolean(profile?.is_verified);
    } catch {
      verified = false;
    }
  }
  const halls = board
    ? await loadTownHalls(
        board.matches.filter((match) => match.status === "concluded").map((match) => match.id),
      ).catch(() => new Map())
    : new Map();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Your address
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            My Ballot
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Matches on your verified OCD-ID, and only after two contenders are seated.
            Likes and comments stay here. Challenges live in Debates.
          </p>
        </header>

        {setup ? <p className="mt-8 text-sm leading-6 text-zinc-300">{setup}</p> : null}
        {board?.signedOut ? (
          <p className="mt-8 text-sm leading-6 text-zinc-300">
            <Link href="/auth/login" className="text-gold">
              Sign in
            </Link>{" "}
            to see the races on your address.
          </p>
        ) : null}
        {board?.needsAddress ? (
          <Link
            href="/onboarding/address"
            className="mt-8 block rounded-xl border border-gold bg-zinc-900 px-6 py-8"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
              Verify district
            </p>
            <p className="mt-3 font-display text-2xl text-parchment">
              Confirm your address to unlock My Ballot.
            </p>
          </Link>
        ) : null}
        {board && !board.signedOut && !board.needsAddress && board.matches.length === 0 ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            No seated matches on your ballot yet.
          </p>
        ) : null}

        <div className="mt-8 grid gap-6">
          {board?.matches.map((match) => (
            <article key={match.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  {raceLabel(match.state, match.district, match.officeName)}
                </p>
                {match.priority ? (
                  <span className="rounded-full border border-gold px-2 py-0.5 text-[10px] uppercase tracking-widest text-gold">
                    Frontrunner
                  </span>
                ) : null}
                {match.crowd ? (
                  <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] uppercase tracking-widest text-parchment">
                    Crowd Favorite {match.crowd.percent}% · {match.crowd.name}
                  </span>
                ) : null}
                <span className="ml-auto">
                  <ReportDebateButton
                    debateId={match.id}
                    viewerId={user?.id ?? null}
                    participants={[
                      { id: match.sideA.id, name: match.sideA.name },
                      { id: match.sideB.id, name: match.sideB.name },
                    ]}
                  />
                </span>
              </div>
              <h2 className="mt-3 font-display text-xl text-parchment">{match.prompt}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[match.sideA, match.sideB].map((side, index) => (
                  <div key={side.id} className="rounded-lg border border-zinc-800 px-3 py-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-parchment">
                      <CandidateAvatar name={side.name} avatarUrl={side.avatarUrl} size="sm" />
                      <Link href={`/profile/${side.id}`} className="hover:text-gold">
                        {side.name}
                      </Link>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-500">
                      <span>{tierLabel(side.tier)}</span>
                      {side.tier === "frontrunner" ? (
                        <span className="rounded-full border border-gold px-2 py-0.5 text-[10px] tracking-widest text-gold">
                          Frontrunner
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {index === 0 ? match.stanceA : match.stanceB || "Rebuttal not filed yet."}
                    </p>
                    {side.tier === "declared_candidate" ? (
                      <Link href={`/profile/${side.id}`} className="mt-3 inline-flex text-xs uppercase tracking-widest text-gold">
                        Platform
                      </Link>
                    ) : null}
                    {side.tier === "frontrunner" && side.donationHref ? (
                      <a
                        href={side.donationHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex text-xs uppercase tracking-widest text-gold"
                      >
                        Contribute
                      </a>
                    ) : side.tier === "frontrunner" ? (
                      <Link href={`/candidate/${side.id}`} className="mt-3 inline-flex text-xs uppercase tracking-widest text-gold">
                        Donate
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
              {match.status === "active" ? (
                <p className="mt-4 text-sm text-zinc-300">In progress. Rebuttals stay on Debates.</p>
              ) : match.isTie ? (
                <p className="mt-4 text-sm text-zinc-300">Tie.</p>
              ) : match.winnerId ? (
                <p className="mt-4 text-sm text-zinc-300">
                  Result recorded for {match.winnerId === match.sideA.id ? match.sideA.name : match.sideB.name}.
                </p>
              ) : null}
              {match.status === "concluded" ? (
                <TownHall
                  debateId={match.id}
                  questions={halls.get(match.id) ?? []}
                  viewerId={user?.id ?? null}
                  verified={verified}
                  candidateAId={match.sideA.id}
                  candidateBId={match.sideB.id || null}
                />
              ) : null}
              <BallotEngage
                debateId={match.id}
                sideA={match.sideA}
                sideB={match.sideB}
                viewerSupportId={match.viewerSupportId}
                comments={match.comments}
              />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
