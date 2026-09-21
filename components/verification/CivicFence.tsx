import Link from "next/link";
import { cn } from "@/lib/utils";
import { CIVIC_FENCE_HINT } from "@/lib/verification";

export function CivicFence({
  fenced,
  children,
  className,
}: {
  fenced: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!fenced) return children;

  return (
    <span
      className={cn("group relative inline-flex", className)}
      tabIndex={0}
      title={CIVIC_FENCE_HINT}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-20 hidden w-56 -translate-x-1/2 rounded-md border border-gold/50 bg-zinc-950 px-3 py-2 text-center text-[11px] leading-4 text-parchment shadow-[0_8px_24px_rgba(0,0,0,0.45)] group-hover:block group-focus-within:block"
      >
        {CIVIC_FENCE_HINT}
      </span>
    </span>
  );
}

export function CivicFenceNote({ href = "/my-campaign/verify" }: { href?: string }) {
  return (
    <p className="text-[11px] leading-5 text-gold">
      {CIVIC_FENCE_HINT}{" "}
      <Link
        href={href}
        className="ml-1 font-medium uppercase tracking-widest underline decoration-gold/50 underline-offset-4 hover:text-parchment"
      >
        Open verification hub
      </Link>
    </p>
  );
}
