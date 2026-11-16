import type { Metadata } from "next";
import { ElectionRaceHub } from "@/app/elections/[state]/race-hub";
import { loadStateViewer, toDirectoryPrimary } from "@/app/elections/[state]/state-page-data";
import { StateElectionsView } from "@/app/elections/[state]/state-elections-view";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  activeRaces,
  closestRaces,
  countByTier,
  groupGeneralRaces,
  isMacroStatewideOffice,
  primaryOfficeName,
  type RaceTier,
} from "@/lib/elections/state-directory";
import { collapseDuplicateOffices } from "@/lib/elections/unique-offices";
import { resolveStateParam } from "@/lib/platform/states";
import { partyLabel } from "@/lib/platform/types";
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

  const directory = collapseDuplicateOffices(groupGeneralRaces(primaries.map(toDirectoryPrimary)));
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

  const viewer = await loadStateViewer();
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
    <StateElectionsView
      code={state.code}
      name={state.name}
      viewer={viewer}
      ranked={ranked}
      selectedTier={selectedTier}
      agendaTab={agendaTab}
      counts={counts}
      tierRaces={tierRaces}
      setup={setup}
      hasPrimaries={primaries.length > 0}
      statewide={statewide}
      targets={targets}
      agendaMissing={agendaMissing}
    />
  );
}
