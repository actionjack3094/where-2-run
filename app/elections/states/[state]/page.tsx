import { redirect } from "next/navigation";
import { stateByCode } from "@/lib/platform/states";

type LegacyStatePageProps = {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ level?: string }>;
};

/** Legacy `/elections/states/[state]` → `/elections/[state]`. */
export default async function LegacyStateElectionsRedirect(props: LegacyStatePageProps) {
  const { state } = await props.params;
  const searchParams = await props.searchParams;
  const match = stateByCode(state);
  const target = match?.code ?? state.trim().toUpperCase();
  const level = searchParams.level;
  redirect(level ? `/elections/${target}?level=${level}` : `/elections/${target}`);
}
