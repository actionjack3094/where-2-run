"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { InboxMenu } from "@/app/components/InboxMenu";
import { AccountSlot } from "@/components/nav-account";
import { NotificationBell } from "@/components/navigation/NotificationBell";
import { NavLink } from "@/components/nav-link";
import { NAV_FOCUS, NAV_LINKS } from "@/components/nav-links";
import { loadNavIdentity, type NavIdentity } from "@/lib/actions/profile";
import { cn } from "@/lib/utils";

export function Navbar({ identity }: { identity: NavIdentity | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [live, setLive] = useState(identity);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setOpen(false);
    setMenuOpen(false);
  }

  useEffect(() => {
    setLive(identity);
  }, [identity]);

  useEffect(() => {
    function refresh() {
      void loadNavIdentity()
        .then(setLive)
        .catch(() => setLive(null));
    }
    window.addEventListener("where2run:identity", refresh);
    return () => window.removeEventListener("where2run:identity", refresh);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="border-b border-amber-500/30 bg-stone-50">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Where 2 Run home"
          className="font-display shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-amber-800"
        >
          WHERE 2 RUN
        </Link>
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-3 lg:gap-5 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} active={link.match(pathname)}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {live ? <InboxMenu /> : null}
          <NotificationBell />
          {live ? (
            <AccountSlot identity={live} menuId={menuId} menuOpen={menuOpen} menuRef={menuRef} setMenuOpen={setMenuOpen} />
          ) : (
            <div className="hidden md:block">
              <AccountSlot identity={live} menuId={menuId} menuOpen={menuOpen} menuRef={menuRef} setMenuOpen={setMenuOpen} />
            </div>
          )}
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-900 transition-colors duration-200 hover:bg-white md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      {open ? (
        <nav id="mobile-nav" className="flex flex-col gap-1 border-t border-amber-500/30 px-6 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-2 py-2 text-[11px] font-medium uppercase tracking-widest transition-colors duration-200 hover:bg-white",
                NAV_FOCUS,
                link.match(pathname) ? "text-amber-800" : "text-stone-600",
              )}
            >
              {link.label}
            </Link>
          ))}
          {!live ? (
            <div className="px-2 py-2">
              <AccountSlot
                identity={live}
                menuId={menuId}
                menuOpen={menuOpen}
                menuRef={menuRef}
                setMenuOpen={setMenuOpen}
                stacked
              />
            </div>
          ) : null}
        </nav>
      ) : null}
    </header>
  );
}
