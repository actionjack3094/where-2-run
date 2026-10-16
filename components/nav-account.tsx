"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { signOutAction } from "@/app/actions/auth";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import type { NavIdentity } from "@/lib/actions/profile";
import { tierLabel } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

export function AccountSlot({
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
          className="text-[11px] font-medium uppercase tracking-widest text-stone-600 transition-colors hover:text-stone-900"
        >
          Sign In
        </Link>
        <Link
          href="/auth/login?mode=create"
          className="inline-flex h-8 items-center rounded-md bg-gold-strong px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-900"
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
        className="flex items-center gap-2 rounded-full py-1 pr-2 text-left outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-600"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <CandidateAvatar name={identity.name} avatarUrl={identity.avatarUrl} size="sm" />
        <span className="hidden max-w-[9rem] truncate text-sm text-stone-900 md:inline">{identity.name}</span>
        <span className="hidden rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-800 md:inline">
          {tierLabel(identity.tier)}
        </span>
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-amber-500/30 bg-white py-1 shadow-lg"
        >
          <MenuLink href="/dashboard">Candidate HQ</MenuLink>
          <MenuLink href="/campaign-hub">Campaign Hub</MenuLink>
          <MenuLink href={`/profile/${identity.id}`}>View Public Profile</MenuLink>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-stone-600 hover:bg-stone-50 hover:text-stone-900"
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
      className="block px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-stone-600 hover:bg-stone-50 hover:text-stone-900"
    >
      {children}
    </Link>
  );
}
