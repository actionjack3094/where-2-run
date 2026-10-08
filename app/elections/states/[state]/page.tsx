import { redirect } from "next/navigation";
import { resolveStateParam } from "@/lib/platform/states";

type LegacyStatePageProps = {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ level?: string }>;
};

/** Legacy `/elections/states/[state]` → `/elections/[state]`. */
export default async function LegacyStateElectionsRedirect(props: LegacyStatePageProps) {
  const { state } = await props.params;
  const searchParams = await props.searchParams;
  const match = resolveStateParam(state);
  const target = match?.code ?? state.trim().toLowerCase();
  const level = searchParams.level;
  redirect(level ? `/elections/${target}?level=${level}` : `/elections/${target}`);
}
