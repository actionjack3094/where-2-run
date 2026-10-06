import type { Metadata } from "next";
import Link from "next/link";
import { CreateChallengeForm } from "@/app/debates/create/create-challenge-form";
import { BOT_SPAR_GRACE_MS } from "@/lib/ai/bots";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { AGENDA_TOP, loadCommunityPrompts } from "@/lib/platform/agenda";
import { loadPrimaryBySlug, loadProfile, platformAdmin } from "@/lib/platform/records";
import { partyFromCoordinate } from "@/lib/platform/scoring";
import { partyLabel } from "@/lib/platform/types";
import { primaryClosed } from "@/lib/platform/cycle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create challenge · WHERE 2 RUN",
  description: "Open a debate from one of the top issues on the district agenda.",
};

export default async function CreateDebatePage(props: { searchParams: Promise<{ primary?: string }> }) {
  const { primary: slug } = await props.searchParams;
  if (!slug) {
    return (
      <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
          <h1 className="font-display text-3xl text-stone-900">Create challenge</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Open a{" "}
            <Link href="/elections" className="text-amber-800">
              primary hub
            </Link>{" "}
            and choose an issue from its district agenda.
          </p>
        </div>
      </main>
    );
  }

  const user = await getServerUser().catch(() => null);
  let setup: string | null = null;
  let primary: Awaited<ReturnType<typeof loadPrimaryBySlug>> = null;
  try {
    primary = await loadPrimaryBySlug(platformAdmin(), slug);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load that primary.";
    setup = isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message;
  }

  if (!setup && !primary) {
    setup = "That primary is not on the board.";
  }

  let canPost = false;
  if (user && primary) {
    try {
      const profile = await loadProfile(platformAdmin(), user.id);
      canPost = Boolean(
        profile?.onboarding_completed &&
          profile.ideology_x != null &&
          profile.ideology_y != null &&
          !profile.is_banned &&
          partyFromCoordinate({ x: profile.ideology_x, y: profile.ideology_y }) ===
            (primary.party === "republican" ? "republican" : "democrat"),
      );
    } catch {
      canPost = false;
    }
  }

  let prompts: Awaited<ReturnType<typeof loadCommunityPrompts>>["prompts"] = [];
  if (primary) {
    try {
      const agenda = await loadCommunityPrompts(primary.id, user?.id ?? null, AGENDA_TOP);
      if (agenda.missing) setup = "Apply the constituent agenda migration, then reload.";
      else prompts = agenda.prompts;
    } catch (caught) {
      setup = caught instanceof Error ? caught.message : "Could not load the district agenda.";
    }
  }

  const closed = primary ? primaryClosed(primary) : false;
  const party = primary?.party === "republican" ? "republican" : "democrat";

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        {primary ? (
          <Link href={`/elections/${primary.slug}`} className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
            {partyLabel(party)} · {primary.office_name}
          </Link>
        ) : null}
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-stone-900">
          Create challenge
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          The topic comes from the top issues filed by verified voters. Write the opening stance.
        </p>
        {setup ? <p className="mt-8 text-sm leading-6 text-stone-600">{setup}</p> : null}
        {!setup && primary && closed ? (
          <p className="mt-8 text-sm text-stone-600">This primary has closed. Debates are locked.</p>
        ) : null}
        {!setup && primary && !closed && !user ? (
          <p className="mt-8 text-sm text-stone-600">
            <Link href={`/auth/login?next=${encodeURIComponent(`/debates/create?primary=${primary.slug}`)}`} className="text-amber-800">
              Sign in
            </Link>{" "}
            to open a seat.
          </p>
        ) : null}
        {!setup && primary && !closed && user && !canPost ? (
          <p className="mt-8 text-sm text-stone-600">
            Finish the{" "}
            <Link href="/onboarding/ideology" className="text-amber-800">
              diagnostic
            </Link>{" "}
            and stay inside this party to post.
          </p>
        ) : null}
        {!setup && primary && !closed && canPost ? (
          <CreateChallengeForm
            primaryId={primary.id}
            prompts={prompts}
            allowSpar={process.env.NODE_ENV !== "production"}
            sparMinutes={BOT_SPAR_GRACE_MS / 60000}
          />
        ) : null}
      </div>
    </main>
  );
}
