import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DistrictAgenda } from "@/app/elections/[slug]/district-agenda";
import { IdeologyCompass, compassFromPlane } from "@/components/IdeologyCompass";
import {
  CIVIC_STANDING_TIP,
  DISTRICT_AGENDA_TIP,
  IDEOLOGY_COMPASS_TIP,
  InfoTooltip,
} from "@/components/InfoTooltip";
import { ChallengeForm } from "@/components/platform/ArenaForms";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadCommunityPrompts } from "@/lib/platform/agenda";
import { daysUntilPrimary, formatPrimaryDate } from "@/lib/platform/cycle";
import { loadPrimaryHub } from "@/lib/platform/queries";
import { loadProfile, platformAdmin } from "@/lib/platform/records";
import { partyFromCoordinate } from "@/lib/platform/scoring";
import { formatCoordinate, partyLabel, tierLabel } from "@/lib/platform/types";

export const dynamic = "force-dynamic";

type HubPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(props: HubPageProps): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: `${slug} · WHERE 2 RUN` };
}

function partyHref(
  target: "democrat" | "republican",
  party: string,
  slug: string,
  counterpartyParty: string | null,
  counterpartySlug: string | null,
) {
  if (party === target) return `/elections/${slug}`;
  if (counterpartyParty === target && counterpartySlug) return `/elections/${counterpartySlug}`;
  return null;
}

export default async function ElectionRacePage(props: HubPageProps) {
  const { slug } = await props.params;
  let hub: Awaited<ReturnType<typeof loadPrimaryHub>> = null;
  let setup: string | null = null;
  try {
    hub = await loadPrimaryHub(slug);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load this election.";
    setup = isMissingSchema({ message })
      ? "Apply the civic rebrand migration, then reload."
      : message;
  }
  if (!setup && !hub) notFound();

  const user = await getServerUser();
  let canPost = false;
  let verified = false;
  if (user && hub) {
    try {
      const profile = await loadProfile(platformAdmin(), user.id);
      verified = Boolean(profile?.is_verified);
      canPost = Boolean(
        profile?.onboarding_completed &&
          profile.ideology_x != null &&
          profile.ideology_y != null &&
          !profile.is_banned &&
          partyFromCoordinate({ x: profile.ideology_x, y: profile.ideology_y }) === hub.party,
      );
    } catch {
      canPost = false;
    }
  }

  let agenda: Awaited<ReturnType<typeof loadCommunityPrompts>> = { prompts: [], missing: false };
  if (hub) {
    try {
      agenda = await loadCommunityPrompts(hub.id, user?.id ?? null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load the district agenda.";
      agenda = { prompts: [], missing: isMissingSchema({ message }) };
      if (!agenda.missing) setup = setup ?? message;
    }
  }

  const nominee = hub
    ? (hub.leaderboard.find((row) => row.isNominee) ?? hub.unranked.find((row) => row.isNominee) ?? null)
    : null;
  const ranked = hub
    ? nominee
      ? [nominee, ...hub.leaderboard.filter((row) => row.userId !== nominee.userId)]
      : hub.leaderboard
    : [];
  const unranked = hub ? hub.unranked.filter((row) => row.userId !== nominee?.userId) : [];
  const daysLeft = hub?.primaryDate ? daysUntilPrimary(hub.primaryDate) : 0;
  const baseline = hub ? compassFromPlane(hub.baselineX, hub.baselineY) : null;
  const parties = hub
    ? [
        {
          id: "democrat" as const,
          label: "Democratic Primary",
          mark: "🔵",
          href: partyHref("democrat", hub.party, hub.slug, hub.counterpartyParty, hub.counterpartySlug),
          active: hub.party === "democrat",
        },
        {
          id: "republican" as const,
          label: "Republican Primary",
          mark: "🔴",
          href: partyHref("republican", hub.party, hub.slug, hub.counterpartyParty, hub.counterpartySlug),
          active: hub.party === "republican",
        },
      ]
    : [];

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link
          href={hub ? `/elections/states/${hub.state}` : "/elections"}
          className="text-[11px] uppercase tracking-[0.2em] text-amber-800"
        >
          {hub ? hub.state : "Elections"}
        </Link>
        {setup || !hub || !baseline ? (
          <p className="mt-8 text-sm text-stone-600">{setup}</p>
        ) : (
          <>
            <header className="mt-4">
              <nav className="flex flex-wrap gap-2" aria-label="Party primary">
                {parties.map((item) =>
                  item.href ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-current={item.active ? "page" : undefined}
                      className={
                        item.active
                          ? "rounded-full bg-stone-100 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900"
                          : "rounded-full border border-amber-500/30 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600 hover:border-amber-600"
                      }
                    >
                      {item.mark} {item.label}
                    </Link>
                  ) : (
                    <span
                      key={item.id}
                      className="rounded-full border border-amber-500/30 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-600"
                    >
                      {item.mark} {item.label}
                    </span>
                  ),
                )}
              </nav>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-stone-600">
                {partyLabel(hub.party)} primary
              </p>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-900">
                {hub.officeName}
                {hub.district ? ` · ${hub.state}-${hub.district}` : ` · ${hub.state}`}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h2 className="text-sm text-stone-900">Ideology Compass</h2>
                <InfoTooltip label="Ideology Compass" text={IDEOLOGY_COMPASS_TIP} />
              </div>
              <p className="mt-1 text-sm text-stone-600">
                Primary baseline {formatCoordinate(hub.baselineX, hub.baselineY)}
              </p>
              <div className="mt-4">
                <IdeologyCompass points={[{ ...baseline }]} />
              </div>
              {hub.closed && hub.primaryDate ? (
                <p className="mt-4 rounded-xl border border-amber-500/30 bg-white px-4 py-3 text-sm leading-6 text-stone-900">
                  This primary concluded on {formatPrimaryDate(hub.primaryDate)}. Debates are permanently locked.
                </p>
              ) : hub.primaryDate ? (
                <p className="mt-4 text-sm text-stone-600">
                  Primary Date: {formatPrimaryDate(hub.primaryDate)} ({daysLeft}{" "}
                  {daysLeft === 1 ? "day" : "days"} remaining)
                </p>
              ) : null}
              <p className="mt-1 text-xs text-stone-600">{hub.ocdId}</p>
            </header>

            <section className="mt-10">
              <h2 className="inline-flex items-center gap-2 font-display text-xl text-stone-900">
                Leaderboard
                <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Declared Candidates and Frontrunners are verified and listed under their legal name.
                Everyone else keeps their Civic Standing in the unranked division.
              </p>
              {ranked.length === 0 ? (
                <p className="mt-4 text-sm text-stone-600">No declared contenders in this primary yet.</p>
              ) : (
                <ol className="mt-4 grid gap-3">
                  {ranked.map((row, index) => (
                    <li
                      key={row.userId}
                      className={
                        row.isNominee
                          ? "rounded-xl border border-gold px-4 py-3"
                          : "rounded-xl border border-amber-500/30 px-4 py-3"
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium text-stone-900">
                          <CandidateAvatar
                            name={row.legalName ?? row.displayName}
                            avatarUrl={row.avatarUrl}
                            size="sm"
                          />
                          {index + 1}.{" "}
                          <Link href={`/profile/${row.userId}`} className="hover:text-amber-800">
                            {row.legalName ?? row.displayName}
                          </Link>
                          {row.isNominee ? (
                            <span className="ml-2 text-[11px] font-medium uppercase tracking-widest text-amber-800">
                              Party Nominee
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-stone-600">{row.civicStanding} Civic Standing</p>
                      </div>
                      <p className="mt-1 text-[11px] uppercase tracking-widest text-stone-600">
                        {tierLabel(row.tier)} · {row.debatesLogged} Debates Logged · {row.policyConsistency}% Policy Consistency
                      </p>
                      <div className="mt-2 flex gap-4">
                        {row.tier === "declared_candidate" || row.tier === "frontrunner" ? (
                          <Link href={`/profile/${row.userId}`} className="text-xs uppercase tracking-widest text-amber-800">
                            Platform
                          </Link>
                        ) : null}
                        {row.tier === "frontrunner" ? (
                          <Link href={`/candidate/${row.userId}`} className="text-xs uppercase tracking-widest text-amber-800">
                            Donate
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {unranked.length > 0 ? (
                <div className="mt-8">
                  <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-stone-600">
                    Unranked
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Pseudonyms and unverified debaters compete here until Stripe verification and a legal name.
                  </p>
                  <ul className="mt-4 grid gap-3">
                    {unranked.map((row) => (
                      <li key={row.userId} className="rounded-xl border border-amber-500/30 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-2 text-sm font-medium text-stone-900">
                            <CandidateAvatar name={row.displayName} avatarUrl={row.avatarUrl} size="sm" />
                            <Link href={`/profile/${row.userId}`} className="hover:text-amber-800">
                              {row.displayName}
                            </Link>
                          </p>
                          <p className="text-sm text-stone-600">{row.civicStanding} Civic Standing</p>
                        </div>
                        <p className="mt-1 text-[11px] uppercase tracking-widest text-stone-600">
                          {row.verified ? "Pundit" : "Unverified"} · {row.debatesLogged} Debates Logged · {row.policyConsistency}% Policy Consistency
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="mt-10">
              <h2 className="inline-flex items-center gap-2 font-display text-xl text-stone-900">
                District Agenda
                <InfoTooltip label="District Agenda" text={DISTRICT_AGENDA_TIP} />
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Verified voters file the issues. Candidates open debates from the highest voted ones.
              </p>
              {agenda.missing ? (
                <p className="mt-4 text-sm text-stone-600">Apply the constituent agenda migration, then reload.</p>
              ) : (
                <DistrictAgenda
                  primaryId={hub.id}
                  prompts={agenda.prompts}
                  verified={verified}
                  signedIn={Boolean(user)}
                  closed={hub.closed}
                />
              )}
            </section>

            <section className="mt-10">
              <h2 className="font-display text-xl text-stone-900">Open questions</h2>
              <div className="mt-4 grid gap-4">
                {hub.openSeats.map((seat) => (
                  <article key={seat.id} className="rounded-xl border border-amber-500/30 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-medium text-stone-900">{seat.prompt}</h3>
                      <InfoTooltip label="Civic Standing" text={CIVIC_STANDING_TIP} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{seat.stanceA}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-widest text-stone-600">
                      <Link href={`/profile/${seat.sideA.id}`} className="hover:text-amber-800">
                        {seat.sideA.name}
                      </Link>
                      {" · "}
                      {tierLabel(seat.sideA.tier)}
                    </p>
                    {canPost && !hub.closed && user?.id !== seat.sideA.id ? (
                      <div className="mt-4">
                        <ChallengeForm debateId={seat.id} />
                      </div>
                    ) : null}
                  </article>
                ))}
                {hub.openSeats.length === 0 ? (
                  <p className="text-sm text-stone-600">No open seats in this primary.</p>
                ) : null}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="font-display text-xl text-stone-900">Post a question</h2>
              {hub.closed ? (
                <p className="mt-3 text-sm leading-6 text-stone-600">Debates are permanently locked.</p>
              ) : canPost ? (
                <Link
                  href={`/debates/create?primary=${hub.slug}`}
                  className="mt-4 inline-flex rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900"
                >
                  Create challenge
                </Link>
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {user ? (
                    <>
                      Finish the{" "}
                      <Link href="/onboarding/ideology" className="text-amber-800">
                        diagnostic
                      </Link>{" "}
                      and stay inside this party to post.
                    </>
                  ) : (
                    <>
                      <Link href="/auth/login" className="text-amber-800">
                        Sign in
                      </Link>{" "}
                      to post a question.
                    </>
                  )}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
