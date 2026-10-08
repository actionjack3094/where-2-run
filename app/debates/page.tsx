import type { Metadata } from "next";
import Link from "next/link";
import { CIVIC_STANDING_TIP, IDEOLOGY_COMPASS_TIP, InfoTooltip } from "@/components/InfoTooltip";
import { DistrictGauntletForm } from "@/components/debates/DistrictGauntletForm";
import { ChallengeForm, LockedSeat } from "@/components/platform/ArenaForms";
import { stanceIsStale } from "@/lib/ballot/fading";
import { loadDistrictGauntlet } from "@/lib/debates/load-gauntlet";
import { roundByNumber } from "@/lib/debates/structure";
import { platformAdmin } from "@/lib/platform/records";
import { ReportDebateButton } from "@/components/platform/ReportDebateButton";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { ensureColdStart } from "@/lib/platform/cold-start";
import { loadIdeologicalDebateFeed } from "@/app/lib/match-debate-feed";
import { loadArenaFeed } from "@/lib/platform/queries";
import { formatCoordinate, partyLabel, tierLabel } from "@/lib/platform/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Debates · WHERE 2 RUN",
  description: "Intra-party debates matched to your ideology coordinate.",
};

export default async function DebatesPage(props: { searchParams: Promise<{ filed?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getServerUser();
  const gauntlet = user?.id ? await loadDistrictGauntlet(user.id).catch(() => null) : null;
  let stanceStale = false;
  if (user?.id) {
    const activity = await platformAdmin()
      .from("arena_debates")
      .select("updated_at")
      .or(`candidate_a_id.eq.${user.id},candidate_b_id.eq.${user.id}`)
      .order("updated_at", { ascending: false })
      .limit(1);
    const last = activity.error
      ? null
      : ((activity.data ?? []) as { updated_at: string }[])[0]?.updated_at ?? null;
    stanceStale = stanceIsStale(last);
  }
  let setup: string | null = null;
  try {
    if (user?.id) await ensureColdStart();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (!isMissingSchema({ message }) && !/missing next_public_supabase|service role/i.test(message)) {
      setup = message || "Synthetic debaters could not be seeded.";
    }
  }

  let feed: Awaited<ReturnType<typeof loadArenaFeed>> | null = null;
  let matched: Awaited<ReturnType<typeof loadIdeologicalDebateFeed>> | null = null;
  try {
    [feed, matched] = await Promise.all([
      loadArenaFeed(user?.id ?? null),
      loadIdeologicalDebateFeed(user?.id ?? null),
    ]);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load Debates.";
    setup = isMissingSchema({ message })
      ? "Apply the platform architecture migration, then reload."
      : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">
            Nationwide primaries
          </p>
          <h1 className="mt-3 inline-flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-stone-900">
            Debates
            <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Candidates nationwide are ranked by Euclidean distance from your Townhall coordinate,
            inside your party. Matched primaries open their question queue and any active showdown.
          </p>
          {feed?.coordinate ? (
            <p className="mt-3 text-sm text-stone-900">
              {formatCoordinate(feed.coordinate.x, feed.coordinate.y)}
              {feed.party ? ` · ${partyLabel(feed.party)} primary` : ""}
            </p>
          ) : null}
          {searchParams.filed ? (
            <p className="mt-3 text-sm text-stone-900">Filed. {searchParams.filed}</p>
          ) : null}
        </header>

        {setup ? <p className="mt-8 text-sm leading-6 text-stone-600">{setup}</p> : null}
        {feed?.signedOut ? (
          <p className="mt-8 text-sm text-stone-600">
            <Link href="/auth/login" className="text-amber-800">
              Sign in
            </Link>{" "}
            to enter a primary.
          </p>
        ) : null}
        {feed?.needsDiagnostic ? (
          <Link href="/onboarding/ideology" className="mt-8 block rounded-xl border border-gold bg-white px-6 py-8">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-800">Diagnostic</p>
            <p className="mt-3 font-display text-2xl text-stone-900">
              File your economic and social coordinate to unlock matchmaking.
            </p>
          </Link>
        ) : null}
        {feed && !feed.needsDiagnostic && !feed.signedOut && feed.cards.length === 0 ? (
          <p className="mt-8 text-sm text-stone-600">
            No open seats in range.{" "}
            <Link href="/elections" className="text-amber-800">
              Browse elections
            </Link>
            .
          </p>
        ) : null}

        {matched && matched.userVector && matched.matches.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display text-xl text-stone-900">Closest candidates</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Ranked nationwide from your Townhall baseline{" "}
              {formatCoordinate(matched.userVector.x, matched.userVector.y)}.
            </p>
            <ul className="mt-4 grid gap-3">
              {matched.matches.map((candidate, index) => (
                <li key={candidate.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-stone-900">
                      {index + 1}. {candidate.name}
                    </p>
                    <p className="text-[11px] uppercase tracking-widest text-stone-600">
                      Distance {candidate.distance.toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-stone-600">
                    {formatCoordinate(candidate.vector.x, candidate.vector.y)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {matched && matched.questions.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display text-xl text-stone-900">Matched questions</h2>
            <ol className="mt-4 grid gap-3">
              {matched.questions.map((question) => (
                <li key={question.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-4">
                  <p className="text-[11px] uppercase tracking-widest text-stone-600">
                    <Link href={`/elections/${question.slug}`} className="hover:text-amber-800">
                      {question.office}
                      {question.state ? ` · ${question.state}` : ""}
                    </Link>
                    {" · "}
                    {question.kind}
                    {" · "}
                    {question.candidateName}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-900">{question.prompt}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {matched && matched.showdowns.length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display text-xl text-stone-900">Active showdowns</h2>
            <div className="mt-4 grid gap-4">
              {matched.showdowns.map((debate) => (
                <article key={debate.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
                  <p className="text-[11px] uppercase tracking-widest text-stone-600">
                    <Link href={`/elections/${debate.slug}`} className="hover:text-amber-800">
                      {debate.office}
                      {debate.state ? ` · ${debate.state}` : ""}
                    </Link>
                    {" · "}
                    Distance {debate.distance.toFixed(2)}
                  </p>
                  <h3 className="mt-3 font-display text-xl text-stone-900">{debate.prompt}</h3>
                  <p className="mt-4 text-sm font-medium text-stone-900">{debate.sideA}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{debate.stanceA}</p>
                  {debate.sideB ? (
                    <>
                      <p className="mt-4 text-sm font-medium text-stone-900">{debate.sideB}</p>
                      {debate.stanceB ? (
                        <p className="mt-2 text-sm leading-6 text-stone-600">{debate.stanceB}</p>
                      ) : null}
                    </>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-8 grid gap-6">
          {stanceStale && user ? (
            <p className="mt-8 rounded-xl border border-amber-500/30 bg-white px-5 py-4 text-sm leading-6 text-stone-600">
              Your stance is stale. File an update on the{" "}
              <Link href="/elections" className="text-amber-800">
                Agenda Queue
              </Link>{" "}
              so the match confidence can recover.
            </p>
          ) : null}
          {gauntlet ? (
            <DistrictGauntletForm
              primaryId={gauntlet.primaryId}
              office={gauntlet.office}
              prompts={gauntlet.prompts}
            />
          ) : null}
          {feed?.cards.map((card) => {
            const mine = user?.id === card.sideA.id;
            const next = roundByNumber(card.exchangeRound + 1);
            const filing =
              user?.id != null &&
              next != null &&
              ((next.speaker === "a" && user.id === card.sideA.id) ||
                (next.speaker === "b" && user.id === card.sideB?.id));
            const locked = card.status === "active";
            return (
              <article key={card.id} className="rounded-xl border border-amber-500/30 bg-white px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-600">
                    <Link href={`/elections/${card.primarySlug}`} className="hover:text-amber-800">
                      {partyLabel(card.party)} · {card.officeName}
                    </Link>
                    <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
                  </div>
                  <ReportDebateButton
                    debateId={card.id}
                    viewerId={user?.id ?? null}
                    participants={[
                      { id: card.sideA.id, name: card.sideA.name },
                      ...(card.sideB ? [{ id: card.sideB.id, name: card.sideB.name }] : []),
                    ]}
                  />
                </div>
                <h2 className="mt-3 font-display text-xl text-stone-900">{card.prompt}</h2>
                <p className="mt-4 flex items-center gap-2 text-sm font-medium text-stone-900">
                  <CandidateAvatar name={card.sideA.name} avatarUrl={card.sideA.avatarUrl} size="sm" />
                  <Link href={`/profile/${card.sideA.id}`} className="hover:text-amber-800">
                    {card.sideA.name}
                  </Link>{" "}
                  <span className="text-[11px] uppercase tracking-widest text-stone-600">
                    {tierLabel(card.sideA.tier)}
                  </span>
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{card.stanceA}</p>
                {card.sideB ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-stone-600">
                    <CandidateAvatar name={card.sideB.name} avatarUrl={card.sideB.avatarUrl} size="sm" />
                    Challenged by{" "}
                    <Link href={`/profile/${card.sideB.id}`} className="hover:text-amber-800">
                      {card.sideB.name}
                    </Link>
                  </p>
                ) : null}
                <div className="mt-5">
                  {!locked && !mine && user ? <ChallengeForm debateId={card.id} /> : null}
                  {locked && card.seatLockedUntil ? (
                    <LockedSeat
                      debateId={card.id}
                      until={card.seatLockedUntil}
                      isHolder={filing}
                      label={next?.label ?? "Rebuttal 1"}
                    />
                  ) : null}
                  {mine && !locked ? (
                    <p className="text-sm text-stone-600">Waiting on an intra-party challenge.</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
