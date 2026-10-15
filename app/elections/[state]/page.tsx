import type { Metadata } from "next";
import Link from "next/link";
import { ClosestElections } from "@/app/elections/[state]/closest-elections";
import { ElectionRaceHub } from "@/app/elections/[state]/race-hub";
import { StatewideIssues } from "@/app/elections/[state]/statewide-issues";
import { TierDirectory } from "@/app/elections/[state]/tier-directory";
import { createServerSupabase, getServerUser } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  activeRaces,
  closestRaces,
  countByTier,
  groupGeneralRaces,
  isMacroStatewideOffice,
  primaryOfficeName,
  type DirectoryPrimary,
  type RaceTier,
} from "@/lib/elections/state-directory";
import { loadProfile, platformAdmin } from "@/lib/platform/records";
import { resolveStateParam } from "@/lib/platform/states";
import { partyLabel } from "@/lib/platform/types";
import { cn } from "@/lib/utils";
import type { Primary } from "@/types/database.types";

export const dynamic = "force-dynamic";

type StatePageProps = {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ tab?: string; tier?: string }>;
};

type AgendaRow = {
  id: string;
  primary_id: string;
  title: string;
  content: string;
  upvote_count: number;
};

function asTier(value: string | undefined): RaceTier | null {
  if (value === "federal" || value === "state" || value === "local") return value;
  return null;
}

function officeOf(primary: Primary) {
  return primaryOfficeName(primary.office_name, primary.office);
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function generateMetadata(props: StatePageProps): Promise<Metadata> {
  const { state: raw } = await props.params;
  const match = resolveStateParam(raw);
  if (match) return { title: `${match.name} elections · WHERE 2 RUN` };
  return { title: `${raw} · WHERE 2 RUN` };
}

/** Localized nationwide primaries and the statewide agenda for one state. */
export default async function StateElectionsPage(props: StatePageProps) {
  const { state: raw } = await props.params;
  const { tab, tier: tierParam } = await props.searchParams;
  const state = resolveStateParam(raw);
  if (!state) return <ElectionRaceHub slug={raw} tab={tab} />;

  const supabase = await createServerSupabase();
  let setup: string | null = null;

  const { data: primaryRows, error: primaryError } = await supabase
    .from("primaries")
    .select("*")
    .or(`state.ilike.${state.code},state.ilike."${state.name}"`)
    .order("office_name", { ascending: true });

  if (primaryError) {
    setup = isMissingSchema(primaryError)
      ? "Apply the nationwide primaries migration, then reload."
      : primaryError.message;
  }

  const primaries = (primaryRows ?? []) as Primary[];

  const directory = groupGeneralRaces(primaries.map(toDirectoryPrimary));
  const openRaces = activeRaces(directory);
  const counts = countByTier(directory);
  const selectedTier = asTier(tierParam);
  const tierRaces = selectedTier ? openRaces.filter((race) => race.tier === selectedTier) : [];
  const agendaTab = tab === "agenda";
  const primaryById = new Map(primaries.map((row) => [row.id, row]));

  let agendaPrompts: AgendaRow[] = [];
  let agendaMissing = false;
  const primaryIds = primaries.map((row) => row.id);
  if (!setup && primaryIds.length > 0) {
    const promptResult = await supabase
      .from("community_prompts")
      .select("id, primary_id, title, content, upvote_count")
      .in("primary_id", primaryIds)
      .order("upvote_count", { ascending: false })
      .order("created_at", { ascending: true });
    if (promptResult.error) {
      agendaMissing = isMissingSchema(promptResult.error);
      if (!agendaMissing) setup = promptResult.error.message;
    } else {
      agendaPrompts = (promptResult.data ?? []) as AgendaRow[];
    }
  }

  const viewer = await loadViewer();
  const ranked = viewer.point ? closestRaces(directory, viewer.point) : [];
  const statewide = agendaPrompts.flatMap((item) => {
    const primary = primaryById.get(item.primary_id);
    if (!primary || !isMacroStatewideOffice(officeOf(primary))) return [];
    return [
      {
        id: item.id,
        title: item.title,
        content: item.content,
        upvoteCount: item.upvote_count,
        officeName: officeOf(primary),
        partyLabel: partyLabel(primary.party),
        primaryHref: `/elections/${primary.slug}?tab=agenda`,
      },
    ];
  });
  const targets = openRaces
    .filter((race) => isMacroStatewideOffice(race.officeName))
    .flatMap((race) =>
      race.lanes.map((lane) => ({
        id: lane.id,
        label: `${race.officeName} · ${partyLabel(lane.party)} primary`,
      })),
    );

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <Link href="/elections/states" className="text-[11px] uppercase tracking-[0.2em] text-amber-800">
          All states
        </Link>
        <header className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{state.name}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Active general elections in {state.code}, grouped by federal, state, and local seats.
          </p>
        </header>

        {viewer.signedIn && !viewer.point ? (
          <p className="mt-8 text-sm leading-6 text-stone-600">
            <Link href="/onboarding" className="text-amber-800">
              Finish onboarding
            </Link>{" "}
            to rank the closest elections in {state.name}.
          </p>
        ) : null}
        {viewer.point ? <ClosestElections races={ranked} viewer={viewer.point} /> : null}

        <div role="tablist" aria-label="State elections" className="mt-8 flex flex-wrap gap-2">
          <Link
            href={selectedTier ? `/elections/${state.code}?tier=${selectedTier}` : `/elections/${state.code}`}
            role="tab"
            aria-selected={!agendaTab}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              !agendaTab
                ? "bg-gold-strong text-stone-900"
                : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            Elections
          </Link>
          <Link
            href={`/elections/${state.code}?tab=agenda`}
            role="tab"
            aria-selected={agendaTab}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-full px-4 text-[11px] font-medium uppercase tracking-widest",
              agendaTab
                ? "bg-gold-strong text-stone-900"
                : "border border-gold/40 text-stone-600 hover:border-gold hover:text-stone-900",
            )}
          >
            Statewide Issues
          </Link>
        </div>

        {setup ? <p className="mt-8 text-sm text-stone-600">{setup}</p> : null}

        {!setup && !agendaTab && primaries.length === 0 ? (
          <p className="mt-8 text-sm text-stone-600">No primaries filed in {state.name} yet.</p>
        ) : null}

        {!setup && !agendaTab && primaries.length > 0 ? (
          <TierDirectory stateCode={state.code} counts={counts} selected={selectedTier} races={tierRaces} />
        ) : null}

        {!setup && agendaTab ? (
          <StatewideIssues
            issues={statewide}
            targets={targets}
            signedIn={viewer.signedIn}
            verified={viewer.verified}
            missing={agendaMissing}
          />
        ) : null}
      </div>
    </main>
  );
}

function toDirectoryPrimary(primary: Primary): DirectoryPrimary {
  return {
    id: primary.id,
    party: primary.party,
    officeName: officeOf(primary),
    state: primary.state,
    district: primary.district,
    slug: primary.slug,
    generalSlug: primary.general_slug,
    baselineX: finite(primary.baseline_x),
    baselineY: finite(primary.baseline_y),
    status: primary.status,
    level: primary.level ?? null,
    cycleYear: finite(primary.cycle_year),
  };
}

async function loadViewer() {
  const user = await getServerUser();
  if (!user) return { signedIn: false, verified: false, point: null };
  try {
    const profile = await loadProfile(platformAdmin(), user.id);
    const point =
      profile?.ideology_x != null && profile.ideology_y != null
        ? { x: profile.ideology_x, y: profile.ideology_y }
        : null;
    return {
      signedIn: true,
      verified: Boolean(profile?.is_verified || profile?.tier2_status === "verified"),
      point,
    };
  } catch {
    return { signedIn: true, verified: false, point: null };
  }
}
