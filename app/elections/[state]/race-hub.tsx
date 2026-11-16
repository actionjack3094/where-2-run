import Link from "next/link";
import { notFound } from "next/navigation";
import { DistrictAgenda } from "@/app/elections/[state]/district-agenda";
import { PrimaryHeader } from "@/app/elections/[state]/primary-header";
import { PrimaryLeaderboard } from "@/app/elections/[state]/primary-leaderboard";
import { PrimarySeats } from "@/app/elections/[state]/primary-seats";
import { Tx10Agenda } from "@/app/elections/[state]/tx10-agenda";
import { getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadCommunityPrompts } from "@/lib/platform/agenda";
import { loadPrimaryHub } from "@/lib/platform/queries";
import { loadProfile, platformAdmin } from "@/lib/platform/records";
import { partyFromCoordinate } from "@/lib/platform/scoring";

/** Primary hub for a race slug (e.g. tx-10-dem). */
export async function ElectionRaceHub({ slug, tab }: { slug: string; tab?: string }) {
  const section = tab === "agenda" ? "agenda" : tab === "seats" ? "seats" : "board";
  let hub: Awaited<ReturnType<typeof loadPrimaryHub>> = null;
  let setup: string | null = null;
  try {
    hub = await loadPrimaryHub(slug);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load this election.";
    setup = isMissingSchema({ message }) ? "Apply the civic rebrand migration, then reload." : message;
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

  const nominee = hub?.leaderboard.find((row) => row.isNominee) ?? hub?.unranked.find((row) => row.isNominee) ?? null;
  const ranked = hub
    ? nominee
      ? [nominee, ...hub.leaderboard.filter((row) => row.userId !== nominee.userId)]
      : hub.leaderboard
    : [];
  const unranked = hub ? hub.unranked.filter((row) => row.userId !== nominee?.userId) : [];

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href={hub ? `/elections/${hub.state}` : "/elections"} className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
          {hub ? hub.state : "Elections"}
        </Link>
        {setup || !hub ? (
          <p className="mt-8 text-sm text-stone-600">{setup}</p>
        ) : (
          <>
            <PrimaryHeader hub={hub} section={section} />
            {section === "board" ? <PrimaryLeaderboard slug={hub.slug} ranked={ranked} unranked={unranked} /> : null}
            {section === "agenda" && hub.slug === "tx-10-dem" && agenda.prompts.length === 0 ? <Tx10Agenda /> : null}
            {section === "agenda" && !(hub.slug === "tx-10-dem" && agenda.prompts.length === 0) ? (
              <section className="mt-10">
                <h2 className="font-display text-xl text-stone-900">Agenda Queue</h2>
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
            ) : null}
            {section === "seats" ? (
              <PrimarySeats
                seats={hub.openSeats}
                canPost={canPost}
                closed={hub.closed}
                userId={user?.id ?? null}
                slug={hub.slug}
                signedIn={Boolean(user)}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
