import Link from "next/link";
import { cn } from "@/lib/utils";

export function LaneTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest",
            tab.active
              ? "bg-stone-900 text-stone-50"
              : "bg-white text-stone-600 ring-1 ring-stone-200 hover:text-stone-900",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function electionsTabs(current: "matched" | "ballot" | "directory") {
  return [
    { href: "/", label: "Matched Primaries", active: current === "matched" },
    { href: "/ballot", label: "My Voter Ballot", active: current === "ballot" },
    { href: "/elections/directory", label: "State Directory", active: current === "directory" },
  ];
}
