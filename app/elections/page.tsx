import type { Metadata } from "next";
import { ElectionsExperience } from "@/app/elections/elections-experience";
import { guestMatchedFeed } from "@/app/elections/guest-matches";
import { parseElectionsTab } from "@/lib/elections/hub-types";
import { loadMatchedFeed } from "@/lib/elections/load-matched-feed";
import { loadVoterBallot } from "@/lib/elections/load-voter-ballot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Elections · WHERE 2 RUN",
  description: "Matched primaries, your voter ballot, and the state directory.",
};

export default async function ElectionsHubPage(props: { searchParams: Promise<{ tab?: string; calibrated?: string }> }) {
  const params = await props.searchParams;
  const tab = parseElectionsTab(params.tab);
  const preview = params.calibrated === "true";
  const [matched, ballot] = await Promise.all([
    tab === "matched" ? (preview ? guestMatchedFeed() : loadMatchedFeed()) : Promise.resolve(null),
    tab === "ballot" ? loadVoterBallot() : Promise.resolve(null),
  ]);

  return <ElectionsExperience tab={tab} matched={matched} ballot={ballot} />;
}
