"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  {
    href: "/dashboard",
    label: "Triage",
    match: (path: string) => path.startsWith("/dashboard"),
  },
  {
    href: "/feed",
    label: "Ballot Feed",
    match: (path: string) => path.startsWith("/feed"),
  },
  { href: "/arena", label: "Arena", match: (path: string) => path.startsWith("/arena") },
  {
    href: "/spectator",
    label: "Donor Feed",
    match: (path: string) => path.startsWith("/spectator"),
  },
  {
    href: "/district",
    label: "Leaderboards",
    match: (path: string) => path.startsWith("/district"),
  },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          aria-label="Where 2 Run home"
          className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-950 dark:text-zinc-50"
        >
          Where 2 Run
        </Link>
        <nav className="flex items-center gap-4 overflow-x-auto text-nowrap">
          {links.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-[11px] font-medium uppercase tracking-widest transition-colors",
                  active
                    ? "text-zinc-950 dark:text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
