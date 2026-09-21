import { cn } from "@/lib/utils";

export function CoalitionBadge({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-gold bg-gradient-to-b from-gold/25 to-gold-strong/10 font-display font-semibold uppercase tracking-[0.18em] text-gold shadow-[inset_0_0_0_1px_rgba(212,175,55,0.35)]",
        size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]",
        className,
      )}
    >
      {name}
    </span>
  );
}
