import { Handshake } from "lucide-react";
import { CoalitionBadge } from "@/components/coalitions/CoalitionBadge";

/** Strategic-advantage pill for candidate cards. Renders nothing at zero. */
export function EndorsementBadge({
  count,
  className,
}: {
  count: number | null | undefined;
  className?: string;
}) {
  if (!count || count < 1) return null;

  return (
    <CoalitionBadge
      size="sm"
      icon={<Handshake className="size-3" />}
      name={`${count} ${count === 1 ? "Endorsement" : "Endorsements"}`}
      className={className}
    />
  );
}
