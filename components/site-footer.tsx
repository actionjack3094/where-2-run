import Link from "next/link";

const links = [
  { href: "/feed", label: "Feed" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/profile", label: "My Profile" },
  { href: "/verify", label: "Verify" },
  { href: "/about", label: "About Us" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t-2 border-brass bg-parchment">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/feed"
            className="font-display text-xs font-medium uppercase tracking-[0.2em] text-brass"
          >
            Where 2 Run
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-charcoal-muted">
            Match a district, take the floor, and let the room decide.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] font-medium uppercase tracking-widest text-charcoal-muted transition-colors hover:text-charcoal"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
