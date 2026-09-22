"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  {
    href: "/feed",
    label: "Feed",
    match: (path: string) => path.startsWith("/feed"),
  },
  {
    href: "/elections",
    label: "Elections",
    match: (path: string) =>
      path.startsWith("/elections") || path.startsWith("/debates"),
  },
  {
    href: "/leaderboards",
    label: "Leaderboards",
    match: (path: string) =>
      path.startsWith("/leaderboards") || path.startsWith("/district"),
  },
  {
    href: "/profile",
    label: "My Profile",
    match: (path: string) =>
      path.startsWith("/profile") ||
      path.startsWith("/my-campaign") ||
      path.startsWith("/dashboard"),
  },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-gold bg-zinc-950 shadow-[inset_0_3px_0_0_var(--gold)]">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-x-4 px-6 py-3 sm:h-14 sm:py-0">
        <Link
          href="/feed"
          aria-label="Where 2 Run home"
          className="font-display shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-gold"
        >
          Where 2 Run
        </Link>
        <nav className="ml-auto flex min-w-0 items-center gap-4 overflow-x-auto text-nowrap">
          {links.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-[11px] font-medium uppercase tracking-widest transition-colors",
                  active
                    ? "text-gold"
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
