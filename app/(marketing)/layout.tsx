import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b-2 border-gold bg-zinc-950 shadow-[inset_0_3px_0_0_var(--gold)]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-x-4 px-6 py-3 sm:h-14 sm:py-0">
          <Link
            href="/"
            aria-label="Where 2 Run home"
            className="font-display shrink-0 text-xs font-medium uppercase tracking-[0.2em] text-gold"
          >
            Where 2 Run
          </Link>
          <nav className="ml-auto flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Sign In
            </Link>
            <Button asChild variant="gold" size="sm">
              <Link href="/auth/login?mode=create">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t-2 border-gold bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xs font-medium uppercase tracking-[0.2em] text-gold">
              Where 2 Run
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">
              Match a stance, watch the floor, and let local constituents decide.
            </p>
          </div>
          <Link
            href="/about"
            className="text-[11px] font-medium uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-200"
          >
            About Us
          </Link>
        </div>
      </footer>
    </div>
  );
}
