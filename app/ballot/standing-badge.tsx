import { cn } from "@/lib/utils";

export function StandingBadge({ filed }: { filed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        filed
          ? "bg-gold text-stone-900"
          : "border border-stone-300 bg-stone-100 text-stone-500",
      )}
    >
      {filed ? "On the ballot" : "Prospective"}
    </span>
  );
}
