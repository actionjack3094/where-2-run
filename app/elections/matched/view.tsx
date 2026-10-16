import Link from "next/link";
import { MatchedFilters } from "@/app/elections/matched/filters";
import { MatchedLoopCard } from "@/app/elections/matched/loop-card";
import { asLevel, asScope, asSeats, loadTopQuestions, toDirectoryPrimary } from "@/app/elections/matched/query";
import { MatchedRaceList } from "@/app/elections/matched/race-list";
import { electionsTabs } from "@/components/elections-tabs";
import { LaneTabs } from "@/components/lane-tabs";
import { getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { filterMatchedRaces, rankMatchedRaces, stateFromHome, type MatchedRace } from "@/lib/elections/matched";
import { groupGeneralRaces } from "@/lib/elections/state-directory";
import { loadHomeOcdIds, loadPrimaries, loadProfile, platformAdmin } from "@/lib/platform/records";
import { normalizeOcdId } from "@/lib/civic-fencing";

type PageProps = {
  searchParams: Promise<{ scope?: string; level?: string; seats?: string }>;
};

export async function MatchedPrimaries(props: PageProps) {
  const params = await props.searchParams;
  const scope = asScope(params.scope);
  const level = asLevel(params.level);
  const seats = asSeats(params.seats);

  const user = await getServerUser().catch(() => null);
  let notice: string | null = null;
  let homeOcdIds: string[] = [];
  let viewer: { x: number; y: number } | null = null;
  let races: ReturnType<typeof rankMatchedRaces> = [];
  let needsAddress = false;
  let questions = new Map<string, string>();

  if (user) {
    try {
      const admin = platformAdmin();
      const [profile, home, primaries, incumbents] = await Promise.all([
        loadProfile(admin, user.id),
        loadHomeOcdIds(admin, user.id),
        loadPrimaries(admin),
        admin.from("elections").select("ocd_id, incumbent_name"),
      ]);
      homeOcdIds = home;
      if (profile?.ideology_x != null && profile.ideology_y != null) {
        viewer = { x: profile.ideology_x, y: profile.ideology_y };
      }
      const incumbentByOcd = new Map<string, string>();
      if (!incumbents.error) {
        for (const row of (incumbents.data ?? []) as { ocd_id?: string | null; incumbent_name?: string | null }[]) {
          const name = row.incumbent_name?.trim();
          const id = normalizeOcdId(row.ocd_id);
          if (name && id && !incumbentByOcd.has(id)) incumbentByOcd.set(id, name);
        }
      }
      const matched: MatchedRace[] = groupGeneralRaces(primaries.map(toDirectoryPrimary)).map((race) => ({
        ...race,
        incumbentName: incumbentByOcd.get(normalizeOcdId(race.ocdId)) ?? null,
      }));
      const homeState = stateFromHome(homeOcdIds);
      needsAddress = scope !== "nationwide" && (scope === "backyard" ? homeOcdIds.length === 0 : !homeState);
      if (viewer && !needsAddress) {
        races = rankMatchedRaces(
          filterMatchedRaces(matched, { scope, level, viability: seats }, { ocdIds: homeOcdIds, state: homeState }),
          viewer,
        );
        questions = await loadTopQuestions(races.flatMap((race) => race.lanes.map((lane) => lane.id)));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not rank matched elections.";
      notice = isMissingSchema({ message }) ? "Apply the platform architecture migration, then reload." : message;
    }
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <LaneTabs label="Elections" tabs={electionsTabs("matched")} />
        <header className="mt-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Matched Primaries</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Ranked by how close each primary baseline sits to your vector. The top constituent question is the way onto the floor.
          </p>
        </header>

        <div className="mt-8">
          <MatchedLoopCard />
        </div>
        <MatchedFilters scope={scope} level={level} seats={seats} />

        {notice ? <p className="mt-8 text-sm text-stone-600">{notice}</p> : null}

        {!user ? (
          <p className="mt-8 text-sm leading-6 text-stone-600">
            <Link href="/auth/login?next=/" className="text-amber-800">
              Sign in
            </Link>{" "}
            and finish onboarding to rank races against your vector.
          </p>
        ) : null}

        {user && !viewer && !notice ? (
          <p className="mt-8 text-sm leading-6 text-stone-600">
            <Link href="/onboarding" className="text-amber-800">
              Finish onboarding
            </Link>{" "}
            to rank these races.
          </p>
        ) : null}

        {user && viewer && needsAddress ? (
          <p className="mt-8 text-sm leading-6 text-stone-600">
            <Link href="/onboarding/address" className="text-amber-800">
              Add your home address
            </Link>{" "}
            to use this geographic scope, or switch to Nationwide.
          </p>
        ) : null}

        {user && viewer && !needsAddress && races.length === 0 && !notice ? (
          <p className="mt-8 text-sm text-stone-600">No races match these filters.</p>
        ) : null}

        <MatchedRaceList races={races} viewer={viewer} questions={questions} />
      </div>
    </main>
  );
}
