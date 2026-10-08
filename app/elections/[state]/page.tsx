import type { Metadata } from "next";
import { ElectionRaceHub } from "@/app/elections/[state]/race-hub";
import { StateElectionsView } from "@/app/elections/[state]/state-elections";
import { stateByCode, stateByName } from "@/lib/platform/states";

export const dynamic = "force-dynamic";

type ElectionsParamPageProps = {
  params: Promise<{ state: string }>;
};

function resolveState(param: string) {
  return stateByCode(param) ?? stateByName(param);
}

export async function generateMetadata(props: ElectionsParamPageProps): Promise<Metadata> {
  const { state } = await props.params;
  const match = resolveState(state);
  if (match) return { title: `${match.name} elections · WHERE 2 RUN` };
  return { title: `${state} · WHERE 2 RUN` };
}

/**
 * `/elections/[state]` serves two shapes on one dynamic segment (Next.js cannot
 * host sibling `[state]` and `[slug]` folders):
 * - US state code or name → localized candidates + community agenda
 * - race slug (e.g. tx-senate-2026-dem) → primary hub
 */
export default async function ElectionsParamPage(props: ElectionsParamPageProps) {
  const { state } = await props.params;
  const match = resolveState(state);
  if (match) return <StateElectionsView state={match} />;
  return <ElectionRaceHub slug={state} />;
}
