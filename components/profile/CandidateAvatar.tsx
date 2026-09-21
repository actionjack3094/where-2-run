import Link from "next/link";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

export function candidateInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  const compact = (parts[0] ?? name).replace(/[^a-zA-Z0-9]/g, "");
  return (compact.slice(0, 2) || "?").toUpperCase();
}

export function CandidateAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-gold/60 bg-zinc-800 font-display font-semibold text-gold shadow-[inset_0_0_0_1px_rgba(212,175,55,0.15)]",
        SIZE_CLASS[size],
        className,
      )}
    >
      {candidateInitials(name)}
    </span>
  );
}

export function CandidateIdentity({
  id,
  username,
  size = "md",
  nameClassName,
}: {
  id: string;
  username: string;
  size?: keyof typeof SIZE_CLASS;
  nameClassName?: string;
}) {
  return (
    <Link
      href={`/profile/${id}`}
      className="flex min-w-0 items-center gap-3 rounded-md outline-none transition-colors hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/70"
    >
      <CandidateAvatar name={username} size={size} />
      <span
        className={cn(
          "min-w-0 truncate font-display font-semibold tracking-tight text-parchment hover:text-gold",
          nameClassName,
        )}
      >
        {username}
      </span>
    </Link>
  );
}
