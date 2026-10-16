"use client";

import { SubNavTabs } from "@/components/ui/SubNavTabs";
import type { SoapboxLens } from "@/components/soapbox/types";

const TABS = [
  { id: "candidate", label: "Candidate" },
  { id: "voter", label: "Voter" },
];

export function SoapboxTabs({
  activeTab,
  onChange,
}: {
  activeTab: SoapboxLens;
  onChange: (tab: SoapboxLens) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <SubNavTabs
        label="Soapbox lens"
        items={TABS}
        activeTab={activeTab}
        onChange={(id) => {
          if (id === "candidate" || id === "voter") onChange(id);
        }}
      />
    </div>
  );
}
