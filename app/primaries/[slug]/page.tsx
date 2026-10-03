import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BOT_SPAR_GRACE_MS } from "@/lib/ai/bots";
import { ChallengeForm, OpeningForm } from "@/components/platform/ArenaForms";
import { getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
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

export default async function PrimaryHubPage(props: HubPageProps) {
  const { slug } = await props.params;
  let hub: Awaited<ReturnType<typeof loadPrimaryHub>> = null;
  let setup: string | null = null;
  try {
    hub = await loadPrimaryHub(slug);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load this primary.";
    if (isMissingSchema({ message })) {
      setup = "Apply the platform architecture migration, then reload.";
    } else {
      setup = message;
    }
  }
  if (!setup && !hub) notFound();

  const user = await getServerUser();
  let canPost = false;
  if (user && hub) {
    try {
      const profile = await loadProfile(platformAdmin(), user.id);
      canPost = Boolean(
        profile?.onboarding_completed &&
          profile.ideology_x != null &&
          profile.ideology_y != null &&
          partyFromCoordinate({ x: profile.ideology_x, y: profile.ideology_y }) === hub.party,
      );
    } catch {
      canPost = false;
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

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/primaries" className="text-[11px] uppercase tracking-[0.2em] text-gold">
          All primaries
        </Link>
        {setup || !hub ? (
          <p className="mt-8 text-sm text-zinc-300">{setup}</p>
        ) : (
          <>
            <header className="mt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                {partyLabel(hub.party)} primary
              </p>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
                {hub.officeName}
                {hub.district ? ` · ${hub.state}-${hub.district}` : ` · ${hub.state}`}
              </h1>
              <p className="mt-2 text-sm text-zinc-300">
                Baseline {formatCoordinate(hub.baselineX, hub.baselineY)}
              </p>
              {hub.closed && hub.primaryDate ? (
                <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm leading-6 text-parchment">
                  This primary concluded on {formatPrimaryDate(hub.primaryDate)}. Debates are permanently locked.
                </p>
              ) : hub.primaryDate ? (
                <p className="mt-4 text-sm text-zinc-300">
                  Primary Date: {formatPrimaryDate(hub.primaryDate)} ({daysLeft}{" "}
                  {daysLeft === 1 ? "day" : "days"} remaining)
                </p>
              ) : null}
              <p className="mt-1 text-xs text-zinc-500">{hub.ocdId}</p>
            </header>

            <section className="mt-10">
              <h2 className="font-display text-xl text-parchment">Leaderboard</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Declared Candidates and Frontrunners are verified and listed under their legal name.
                Everyone else keeps their Elo in the unranked division.
              </p>
              {ranked.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-400">No declared contenders in this primary yet.</p>
              ) : (
                <ol className="mt-4 grid gap-3">
                  {ranked.map((row, index) => (
                    <li
                      key={row.userId}
                      className={
                        row.isNominee
                          ? "rounded-xl border border-gold px-4 py-3"
                          : "rounded-xl border border-zinc-800 px-4 py-3"
                      }
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-parchment">
                          {index + 1}.{" "}
                          <Link href={`/profile/${row.userId}`} className="hover:text-gold">
                            {row.legalName ?? row.displayName}
                          </Link>
                          {row.isNominee ? (
                            <span className="ml-2 text-[11px] font-medium uppercase tracking-widest text-gold">
                              Party Nominee
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-zinc-300">{row.elo} Elo</p>
                      </div>
                      <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">
                        {tierLabel(row.tier)} · {row.wins}-{row.losses}-{row.ties}
                      </p>
                      <div className="mt-2 flex gap-4">
                        {row.tier === "declared_candidate" || row.tier === "frontrunner" ? (
                          <Link href={`/profile/${row.userId}`} className="text-xs uppercase tracking-widest text-gold">
                            Platform
                          </Link>
                        ) : null}
                        {row.tier === "frontrunner" ? (
                          <Link href={`/candidate/${row.userId}`} className="text-xs uppercase tracking-widest text-gold">
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
                  <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-500">
                    Unranked
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Pseudonyms and unverified debaters compete here until Stripe verification and a legal name.
                  </p>
                  <ul className="mt-4 grid gap-3">
                    {unranked.map((row) => (
                      <li key={row.userId} className="rounded-xl border border-zinc-800 px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-parchment">
                            <Link href={`/profile/${row.userId}`} className="hover:text-gold">
                              {row.displayName}
                            </Link>
                          </p>
                          <p className="text-sm text-zinc-300">{row.elo} Elo</p>
                        </div>
                        <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">
                          {row.verified ? "Pundit" : "Unverified"} · {row.wins}-{row.losses}-{row.ties}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="mt-10">
              <h2 className="font-display text-xl text-parchment">Open questions</h2>
              <div className="mt-4 grid gap-4">
                {hub.openSeats.map((seat) => (
                  <article key={seat.id} className="rounded-xl border border-zinc-800 px-4 py-4">
                    <h3 className="text-sm font-medium text-parchment">{seat.prompt}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{seat.stanceA}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-widest text-zinc-500">
                      <Link href={`/profile/${seat.sideA.id}`} className="hover:text-gold">
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
                  <p className="text-sm text-zinc-400">No open seats in this primary.</p>
                ) : null}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="font-display text-xl text-parchment">Post a question</h2>
              {hub.closed ? (
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Debates are permanently locked.
                </p>
              ) : canPost ? (
                <OpeningForm
                  primaryId={hub.id}
                  botSparGraceMinutes={
                    process.env.NODE_ENV === "production" ? null : BOT_SPAR_GRACE_MS / 60000
                  }
                />
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {user ? (
                    <>
                      Finish the{" "}
                      <Link href="/onboarding/ideology" className="text-gold">
                        diagnostic
                      </Link>{" "}
                      and stay inside this party to post.
                    </>
                  ) : (
                    <>
                      <Link href="/auth/login" className="text-gold">
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
