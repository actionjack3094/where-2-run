import { STORAGE_KEYS } from "@/lib/session";
import { supabase } from "@/lib/db/supabase";
import type { Pledge } from "@/types/database.types";

export const GRASSROOTS_THRESHOLD = 5000;
export const QUICK_PLEDGE_AMOUNTS = [5, 15, 25, 50] as const;
export const ANONYMOUS_DONOR = "Anonymous Citizen";
export const MAX_PLEDGE_AMOUNT = 10_000;

export function parseAmount(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function formatUsd(amount: string | number | null | undefined) {
  const numeric = parseAmount(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatRelativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.round(delta / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function donorDisplayName() {
  if (typeof window === "undefined") return ANONYMOUS_DONOR;
  return window.sessionStorage.getItem(STORAGE_KEYS.username)?.trim() || ANONYMOUS_DONOR;
}

export function createOptimisticPledge(input: {
  candidateId: string;
  amount: number;
  message?: string | null;
}): Pledge {
  return {
    id: crypto.randomUUID(),
    candidate_id: input.candidateId,
    donor_id: null,
    amount: input.amount,
    donor_name: donorDisplayName(),
    message: input.message?.trim() || null,
    created_at: new Date().toISOString(),
  };
}

export async function submitPledge(input: {
  candidateId: string;
  amount: number;
  message?: string | null;
}): Promise<Pledge> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (input.amount > MAX_PLEDGE_AMOUNT) {
    throw new Error(`Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)} in this mock checkout.`);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user ?? null;

  const { data, error } = await supabase
    .from("pledges")
    .insert({
      candidate_id: input.candidateId,
      donor_id: user?.id ?? null,
      amount: input.amount,
      donor_name: donorDisplayName(),
      message: input.message?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not record the pledge.");
  }

  return data;
}
