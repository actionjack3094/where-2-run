"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LibertyBell } from "@/app/components/LibertyBell";
import { LogOutButton } from "@/components/LogOutButton";
import { countPendingJuryDuty } from "@/lib/actions/jury-feed";
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
    href: "/spectator/jury",
    label: "Jury Duty",
    match: (path: string) =>
      path === "/spectator/jury" || path.startsWith("/spectator/jury/"),
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
] as const;

function JuryDutyCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pending ${count === 1 ? "case" : "cases"}`}
      className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 text-[9px] font-semibold tabular-nums text-charcoal"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [juryDutyCount, setJuryDutyCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    countPendingJuryDuty()
      .then((next) => {
        if (!cancelled) setJuryDutyCount(next);
      })
      .catch(() => {
        if (!cancelled) setJuryDutyCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Close the mobile menu whenever the route changes.
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setOpen(false);
  }

  return (
    <header className="border-b-2 border-brass bg-parchment shadow-[inset_0_3px_0_0_var(--brass)]">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-x-4 px-6 py-3 sm:h-14 sm:py-0">
        <Link
          href="/feed"
          aria-label="Where 2 Run home"
          className="font-display shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-brass"
        >
          Where 2 Run
        </Link>
        <nav className="ml-auto hidden min-w-0 items-center gap-4 overflow-x-auto text-nowrap [-ms-overflow-style:none] [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
          {links.map((link) => {
            const active = link.match(pathname);
            const notifications = link.href === "/notifications";
            const juryDuty = link.href === "/spectator/jury";
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={notifications ? "Notifications" : undefined}
                className={cn(
                  "text-[11px] font-medium uppercase tracking-widest transition-colors",
                  notifications
                    ? "inline-flex items-center"
                    : juryDuty
                      ? cn(
                          "inline-flex items-center",
                          active ? "text-brass" : "text-charcoal-muted hover:text-charcoal",
                        )
                      : active
                        ? "text-brass"
                        : "text-charcoal-muted hover:text-charcoal",
                )}
              >
                {notifications ? (
                  <LibertyBell className="text-brass-dark hover:text-brass transition-colors" />
                ) : (
                  <>
                    {link.label}
                    {juryDuty ? <JuryDutyCount count={juryDutyCount} /> : null}
                  </>
                )}
              </Link>
            );
          })}
          <LogOutButton />
        </nav>
        <button
          type="button"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-charcoal transition-colors duration-200 hover:bg-parchment-light sm:hidden"
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
          className="flex flex-col gap-1 border-t border-brass/40 px-6 py-3 sm:hidden"
        >
          {links.map((link) => {
            const active = link.match(pathname);
            const notifications = link.href === "/notifications";
            const juryDuty = link.href === "/spectator/jury";
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={notifications ? "Notifications" : undefined}
                className={cn(
                  "rounded-md px-2 py-2 text-[11px] font-medium uppercase tracking-widest transition-colors duration-200 hover:bg-parchment-light",
                  notifications
                    ? "inline-flex w-fit items-center"
                    : juryDuty
                      ? cn(
                          "inline-flex w-fit items-center",
                          active ? "text-brass" : "text-charcoal-muted",
                        )
                      : active
                        ? "text-brass"
                        : "text-charcoal-muted",
                )}
              >
                {notifications ? (
                  <LibertyBell className="text-brass-dark hover:text-brass transition-colors" />
                ) : (
                  <>
                    {link.label}
                    {juryDuty ? <JuryDutyCount count={juryDutyCount} /> : null}
                  </>
                )}
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
