"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Menu, X } from "lucide-react";
import { InboxMenu } from "@/app/components/InboxMenu";
import { signOutAction } from "@/app/actions/auth";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { loadNavIdentity, type NavIdentity } from "@/lib/actions/profile";
import { tierLabel } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/townhall",
    label: "The Townhall",
    match: (path: string) => path.startsWith("/townhall"),
  },
  {
    href: "/soapbox",
    label: "The Soapbox",
    match: (path: string) => path.startsWith("/soapbox"),
  },
  {
    href: "/debates",
    label: "The Debates",
    match: (path: string) => path.startsWith("/debates") || path.startsWith("/discover"),
  },
  {
    href: "/ballot",
    label: "My Ballot",
    match: (path: string) => path.startsWith("/ballot") || path.startsWith("/feed"),
  },
  {
    href: "/elections",
    label: "Elections",
    match: (path: string) => path.startsWith("/elections") || path.startsWith("/primaries"),
  },
] as const;

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
          href="/ballot"
          aria-label="Where 2 Run home"
          className="font-display shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-amber-800"
        >
          WHERE 2 RUN
        </Link>
        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-3 lg:gap-5 md:flex">
          {LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} active={link.match(pathname)}>
              {link.label}
            </NavLink>
          ))}
          {live ? <InboxMenu /> : null}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          {live ? (
            <span className="inline-flex md:hidden">
              <InboxMenu />
            </span>
          ) : null}
          <div className="hidden md:block">
            <AccountSlot identity={live} menuId={menuId} menuOpen={menuOpen} menuRef={menuRef} setMenuOpen={setMenuOpen} />
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-charcoal transition-colors duration-200 hover:bg-white md:hidden"
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
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-2 py-2 text-[11px] font-medium uppercase tracking-widest transition-colors duration-200 hover:bg-parchment-light",
                link.match(pathname) ? "text-brass" : "text-charcoal-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
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
        </nav>
      ) : null}
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] transition-colors lg:text-[11px] lg:tracking-widest",
        active ? "text-brass" : "text-charcoal-muted hover:text-charcoal",
      )}
    >
      {children}
    </Link>
  );
}

function AccountSlot({
  identity,
  menuId,
  menuOpen,
  menuRef,
  setMenuOpen,
  stacked = false,
}: {
  identity: NavIdentity | null;
  menuId: string;
  menuOpen: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  setMenuOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  stacked?: boolean;
}) {
  if (!identity) {
    return (
      <div className={cn("flex items-center gap-4", stacked && "flex-col items-start")}>
        <Link
          href="/auth/login"
          className="text-[11px] font-medium uppercase tracking-widest text-charcoal-muted transition-colors hover:text-charcoal"
        >
          Sign In
        </Link>
        <Link
          href="/auth/login?mode=create"
          className="inline-flex h-8 items-center rounded-md bg-gold-strong px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-950"
        >
          Get Started
        </Link>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full py-1 pr-2 text-left outline-none hover:bg-parchment-light focus-visible:ring-2 focus-visible:ring-brass"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <CandidateAvatar name={identity.name} avatarUrl={identity.avatarUrl} size="sm" />
        <span className="max-w-[9rem] truncate text-sm text-charcoal">{identity.name}</span>
        <span className="rounded-full border border-gold px-2 py-0.5 text-[10px] uppercase tracking-widest text-brass">
          {tierLabel(identity.tier)}
        </span>
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-brass/50 bg-parchment py-1 shadow-lg"
        >
          <MenuLink href="/dashboard">Candidate HQ</MenuLink>
          <MenuLink href="/campaign">Campaign Hub</MenuLink>
          <MenuLink href={`/profile/${identity.id}`}>View Public Profile</MenuLink>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-charcoal-muted hover:bg-parchment-light hover:text-charcoal"
            onClick={() => {
              setMenuOpen(false);
              void signOutAction();
            }}
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-charcoal-muted hover:bg-parchment-light hover:text-charcoal"
    >
      {children}
    </Link>
  );
}
