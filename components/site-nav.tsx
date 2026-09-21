"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/app-shell";
import { cn } from "@/lib/utils";

const links = [
  {
    href: "/feed",
    label: "Feed",
    match: (path: string) => path.startsWith("/feed"),
  },
  {
    href: "/dashboard",
    label: "My Campaign",
    match: (path: string) => path.startsWith("/dashboard"),
  },
  {
    href: "/leaderboards",
    label: "Leaderboards",
    match: (path: string) =>
      path.startsWith("/leaderboards") || path.startsWith("/district"),
  },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-gold bg-zinc-950 shadow-[inset_0_3px_0_0_var(--accent)]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 sm:h-14 sm:flex-nowrap sm:py-0">
        <Link
          href="/feed"
          aria-label="Where 2 Run home"
          className="font-display shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-gold"
        >
          Where 2 Run
        </Link>
        <nav className="order-last flex w-full min-w-0 items-center gap-4 overflow-x-auto text-nowrap sm:order-none sm:ml-auto sm:w-auto">
          {links.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-[11px] font-medium uppercase tracking-widest transition-colors",
                  active
                    ? "text-accent"
                    : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <ModeToggle className="ml-auto sm:ml-0" />
      </div>
    </header>
  );
}
