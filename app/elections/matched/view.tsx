import Link from "next/link";
import { MatchedFilters } from "@/app/elections/matched/filters";
import { MatchedLoopCard } from "@/app/elections/matched/loop-card";
import { electionsTabs } from "@/components/elections-tabs";
import { LaneTabs } from "@/components/lane-tabs";
import { getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  filterMatchedRaces,
  matchedOfficeLabel,
  rankMatchedRaces,
  stateFromHome,
  type GeoScope,
  type MatchedRace,
  type OfficeFilter,
  type ViabilityFilter,
} from "@/lib/elections/matched";
import {
  alignedLane,
  groupGeneralRaces,
  primaryOfficeName,
  type DirectoryPrimary,
} from "@/lib/elections/state-directory";
import { partyLabel } from "@/lib/platform/types";
import { loadHomeOcdIds, loadPrimaries, loadProfile, platformAdmin } from "@/lib/platform/records";
import { normalizeOcdId } from "@/lib/civic-fencing";
import type { Primary } from "@/types/database.types";

type PageProps = {
  searchParams: Promise<{ scope?: string; level?: string; seats?: string }>;
};

function asScope(value: string | undefined): GeoScope {
  if (value === "state" || value === "nationwide") return value;
  return "backyard";
}

function asLevel(value: string | undefined): OfficeFilter {
  if (value === "federal" || value === "state" || value === "local") return value;
  return "all";
}

function asSeats(value: string | undefined): ViabilityFilter {
  return value === "open" ? "open" : "all";
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function loadTopQuestions(primaryIds: string[]) {
  const unique = [...new Set(primaryIds)];
  const questions = new Map<string, string>();
  if (unique.length === 0) return questions;
  const result = await platformAdmin()
    .from("community_prompts")
    .select("primary_id, title, content, upvote_count")
    .in("primary_id", unique)
    .order("upvote_count", { ascending: false })
    .limit(200);
  if (result.error) return questions;
  for (const row of (result.data ?? []) as { primary_id: string; title: string | null; content: string | null }[]) {
    if (questions.has(row.primary_id)) continue;
    const text = row.title?.trim() || row.content?.trim() || "";
    if (text) questions.set(row.primary_id, text);
  }
  return questions;
}

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

        {races.length > 0 ? (
          <ul className="mt-8 grid gap-4">
            {races.map((race) => {
              const lane = alignedLane(race, viewer);
              const href = lane ? `/elections/${lane.slug}` : "/elections";
              const floor = lane ? `/debates/create?primary=${lane.slug}` : "/debates";
              const question = lane ? questions.get(lane.id) : null;
              return (
                <li key={race.generalSlug} className="rounded-2xl border border-amber-500/30 bg-white px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2
                      className="text-lg font-semibold text-stone-900"
                      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
                    >
                      {matchedOfficeLabel(race)}
                    </h2>
                    <p className="text-sm font-medium tabular-nums text-amber-800">{race.alignment}% Alignment</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">
                    {race.incumbentName ? `Challenger vs. ${race.incumbentName}` : "Open Seat"}
                    {lane ? ` · ${partyLabel(lane.party)} primary` : ""}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-stone-800">
                    {question ?? "No constituent question is on this race yet."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={floor}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-gold-strong px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
                    >
                      Take the Floor
                    </Link>
                    <Link
                      href={href}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 px-4 text-[11px] font-semibold uppercase tracking-widest text-stone-800"
                    >
                      View District Primary
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}

function toDirectoryPrimary(primary: Primary): DirectoryPrimary {
  return {
    id: primary.id,
    party: primary.party,
    officeName: primaryOfficeName(primary.office_name, primary.office),
    state: primary.state,
    district: primary.district,
    slug: primary.slug,
    generalSlug: primary.general_slug,
    baselineX: finite(primary.baseline_x),
    baselineY: finite(primary.baseline_y),
    status: primary.status,
    level: primary.level ?? null,
    cycleYear: finite(primary.cycle_year),
    ocdId: primary.ocd_id,
  };
}
