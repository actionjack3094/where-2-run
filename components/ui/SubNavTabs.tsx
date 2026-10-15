"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
}

interface SubNavTabsProps {
  items: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  label?: string;
}

export function SubNavTabs({ items, activeTab, onChange, label = "Sections" }: SubNavTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-100 p-1 text-stone-500"
    >
      {items.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all",
              isActive ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:text-stone-900",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
