"use client";

import { useRouter } from "next/navigation";
import { SubNavTabs } from "@/components/ui/SubNavTabs";
import type { ElectionsTab, MatchedPrimaryCard, VoterBallotPanel } from "@/lib/elections/hub-types";
import { BallotPanel } from "@/app/elections/elections-ballot-panel";
import { DirectoryPanel } from "@/app/elections/elections-directory-panel";
import { MatchedPanel } from "@/app/elections/elections-matched-panel";

const TABS: { id: ElectionsTab; href: string; label: string }[] = [
  { id: "matched", href: "/", label: "Matched Primaries" },
  { id: "ballot", href: "/?tab=ballot", label: "My Voter Ballot" },
  { id: "directory", href: "/?tab=directory", label: "State Directory" },
];

export function ElectionsExperience({
  tab,
  matched,
  ballot,
}: {
  tab: ElectionsTab;
  matched: { calibrated: boolean; notice: string | null; races: MatchedPrimaryCard[]; guest?: boolean } | null;
  ballot: VoterBallotPanel | null;
}) {
  const router = useRouter();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        <div className="max-w-full overflow-x-auto">
          <SubNavTabs
            label="Elections"
            items={TABS.map(({ id, label }) => ({ id, label }))}
            activeTab={tab}
            onChange={(id) => {
              if (id === "matched" && matched?.guest) {
                router.push("/?calibrated=true");
                return;
              }
              const next = TABS.find((item) => item.id === id);
              if (next) router.push(next.href);
            }}
          />
        </div>

        {tab === "matched" && matched ? <MatchedPanel feed={matched} /> : null}
        {tab === "ballot" && ballot ? <BallotPanel panel={ballot} /> : null}
        {tab === "directory" ? <DirectoryPanel /> : null}
      </div>
    </main>
  );
}
