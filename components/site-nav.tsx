"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LogOutButton } from "@/components/LogOutButton";
import { cn } from "@/lib/utils";

const links = [
  {
    href: "/feed",
    label: "Feed",
    match: (path: string) => path.startsWith("/feed"),
  },
  {
    href: "/matchmaker",
    label: "Matchmaker",
    match: (path: string) => path.startsWith("/matchmaker"),
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
  {
    href: "/notifications",
    label: "Notifications",
    match: (path: string) => path.startsWith("/notifications"),
  },
  {
    href: "/verify",
    label: "Verify",
    match: (path: string) => path === "/verify" || path.startsWith("/verify/"),
  },
  {
    href: "/jury",
    label: "Jury",
    match: (path: string) => path.startsWith("/jury"),
  },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
        <nav className="ml-auto hidden min-w-0 items-center gap-4 overflow-x-auto text-nowrap [-ms-overflow-style:none] [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
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
          <LogOutButton />
        </nav>
        <button
          type="button"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-200 transition-colors duration-200 hover:bg-zinc-800 sm:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      {open ? (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-zinc-800 px-6 py-3 sm:hidden"
        >
          {links.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-2 py-2 text-[11px] font-medium uppercase tracking-widest transition-colors duration-200 hover:bg-zinc-800",
                  active ? "text-gold" : "text-zinc-300",
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="px-2 py-2">
            <LogOutButton />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
