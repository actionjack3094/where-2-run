import { redirect } from "next/navigation";

export default async function CampaignAliasPage(props: { searchParams: Promise<{ primary?: string }> }) {
  const primary = (await props.searchParams).primary?.trim();
  redirect(primary ? `/campaign-hub?primary=${encodeURIComponent(primary)}` : "/campaign-hub");
}
