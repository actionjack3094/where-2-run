import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Triage" },
  { href: "/onboarding", label: "Onboarding Quiz" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/about", label: "About Us" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-950 dark:text-zinc-50"
          >
            Where 2 Run
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Match a district, take the floor, and let the room decide.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
