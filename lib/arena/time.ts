export type ExpiryTone = "ok" | "soon" | "expired";

export function getExpiryState(expiresAt: string, now = Date.now()) {
  const expires = new Date(expiresAt).getTime();
  const remaining = expires - now;

  if (!Number.isFinite(expires) || remaining <= 0) {
    return { label: "Expired", tone: "expired" as ExpiryTone, remaining: 0 };
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const label =
    hours >= 1 ? `${hours}h ${minutes}m left` : `${Math.max(1, minutes)}m left`;

  return {
    label,
    tone: remaining < 2 * 3_600_000 ? ("soon" as const) : ("ok" as const),
    remaining,
  };
}

export const TOTAL_ROUNDS = 3;
