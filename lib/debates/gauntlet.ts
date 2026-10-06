import { filingDeadlineFromPrimary } from "@/lib/platform/cycle";

export const GAUNTLET_LEAD_MS = 45 * 24 * 60 * 60 * 1000;
export const GAUNTLET_PROMPT_COUNT = 3;

export function gauntletWindow(primaryDate: string, now = Date.now()) {
  const deadline = Date.parse(filingDeadlineFromPrimary(primaryDate));
  if (!Number.isFinite(deadline)) return null;
  return {
    deadline,
    opensAt: deadline - GAUNTLET_LEAD_MS,
    open: now >= deadline - GAUNTLET_LEAD_MS && now < deadline,
  };
}

/** An unopposed incumbent inside the 45-day window owes the District Gauntlet. */
export function districtGauntletDue(input: {
  primaryDate: string;
  contenders: number;
  now?: number;
}) {
  if (input.contenders !== 1) return false;
  return gauntletWindow(input.primaryDate, input.now ?? Date.now())?.open === true;
}
