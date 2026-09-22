import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/db/supabase-server";

export const metadata: Metadata = {
  title: "War Room · WHERE 2 RUN",
  description:
    "Private campaign desk: escrow raised, locked ELO, matched districts, and uncaptured SetupIntents.",
};

export default async function MyCampaignLayout({
  children,
}: LayoutProps<"/my-campaign">) {
  const user = await getServerUser();
  if (!user) {
    redirect("/onboarding");
  }

  return children;
}
