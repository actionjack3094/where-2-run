import type { Metadata } from "next";
import Link from "next/link";
import { ChallengeForm, LockedSeat } from "@/components/platform/ArenaForms";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { ensureColdStart } from "@/lib/platform/cold-start";
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
  try {
    feed = await loadArenaFeed(user?.id ?? null);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load Debates.";
    setup = isMissingSchema({ message })
      ? "Apply the platform architecture migration, then reload."
      : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Nationwide primaries
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Debates
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Open seats from primaries closest to you, inside your party. Challenge locks
            the seat for 24 hours.
          </p>
          {feed?.coordinate ? (
            <p className="mt-3 text-sm text-parchment">
              {formatCoordinate(feed.coordinate.x, feed.coordinate.y)}
              {feed.party ? ` · ${partyLabel(feed.party)} primary` : ""}
            </p>
          ) : null}
          {searchParams.filed ? (
            <p className="mt-3 text-sm text-parchment">Filed. {searchParams.filed}</p>
          ) : null}
        </header>

        {setup ? <p className="mt-8 text-sm leading-6 text-zinc-300">{setup}</p> : null}
        {feed?.signedOut ? (
          <p className="mt-8 text-sm text-zinc-300">
            <Link href="/auth/login" className="text-gold">
              Sign in
            </Link>{" "}
            to enter a primary.
          </p>
        ) : null}
        {feed?.needsDiagnostic ? (
          <Link href="/onboarding/ideology" className="mt-8 block rounded-xl border border-gold bg-zinc-900 px-6 py-8">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Diagnostic</p>
            <p className="mt-3 font-display text-2xl text-parchment">
              File your economic and social coordinate to unlock matchmaking.
            </p>
          </Link>
        ) : null}
        {feed && !feed.needsDiagnostic && !feed.signedOut && feed.cards.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-400">
            No open seats in range.{" "}
            <Link href="/primaries" className="text-gold">
              Browse primary hubs
            </Link>
            .
          </p>
        ) : null}

        <div className="mt-8 grid gap-6">
          {feed?.cards.map((card) => {
            const mine = user?.id === card.sideA.id;
            const challenger = user?.id != null && user.id === card.sideB?.id;
            const locked = card.status === "active";
            return (
              <article key={card.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  <Link href={`/primaries/${card.primarySlug}`} className="hover:text-gold">
                    {partyLabel(card.party)} · {card.officeName}
                  </Link>
                </p>
                <h2 className="mt-3 font-display text-xl text-parchment">{card.prompt}</h2>
                <p className="mt-4 text-sm font-medium text-parchment">
                  {card.sideA.name}{" "}
                  <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                    {tierLabel(card.sideA.tier)}
                  </span>
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{card.stanceA}</p>
                {card.sideB ? (
                  <p className="mt-4 text-sm text-zinc-400">Challenged by {card.sideB.name}</p>
                ) : null}
                <div className="mt-5">
                  {!locked && !mine && user ? <ChallengeForm debateId={card.id} /> : null}
                  {locked && card.seatLockedUntil ? (
                    <LockedSeat
                      debateId={card.id}
                      until={card.seatLockedUntil}
                      isHolder={challenger}
                    />
                  ) : null}
                  {mine && !locked ? (
                    <p className="text-sm text-zinc-400">Waiting on an intra-party challenge.</p>
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
