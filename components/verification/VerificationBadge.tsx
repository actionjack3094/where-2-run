import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasTrustBadge, verificationLabel } from "@/lib/verification";

const SIZE_CLASS = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

export function VerificationBadge({
  tier,
  size = "md",
  className,
  decorative = false,
}: {
  tier: string | null | undefined;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  decorative?: boolean;
}) {
  if (!hasTrustBadge(tier)) return null;

  const label = verificationLabel(tier);

  return (
    <span
      title={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-gold",
        className,
      )}
    >
      <ShieldCheck
        aria-hidden
        className={cn(SIZE_CLASS[size], "fill-gold/15 stroke-[2.25]")}
      />
    </span>
  );
}
