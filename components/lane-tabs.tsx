"use client";

import { useRouter } from "next/navigation";
import { SubNavTabs } from "@/components/ui/SubNavTabs";

export function LaneTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; active: boolean }[];
}) {
  const router = useRouter();
  const activeTab = tabs.find((tab) => tab.active)?.href ?? "";

  return (
    <nav aria-label={label} className="max-w-full overflow-x-auto">
      <SubNavTabs
        label={label}
        items={tabs.map((tab) => ({ id: tab.href, label: tab.label }))}
        activeTab={activeTab}
        onChange={(href) => router.push(href)}
      />
    </nav>
  );
}
