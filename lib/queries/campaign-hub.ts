import { isMissingRelation } from "@/lib/coalitions";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { parseAmount } from "@/lib/pledges";

export type EscrowBalance = {
  /** `released`: unlock condition met, available to disburse. */
  available: number;
  /** `pending`: still waiting on its unlock condition. */
  locked: number;
  /** `disbursed`: already paid out. */
  disbursed: number;
};

export type CandidateEscrowBalance = EscrowBalance & {
  byElection: Record<string, EscrowBalance>;
  error: string | null;
};

const EMPTY: EscrowBalance = { available: 0, locked: 0, disbursed: 0 };

export function emptyEscrowBalance(): EscrowBalance {
  return { ...EMPTY };
}

/**
 * Pledge totals for a candidate, overall and per race (`election_id`).
 *
 * `campaign_pledges` is readable only by its donor under RLS, so this reads
 * with the service-role client. It trusts `candidateId`: call it only from
 * server code that has already established who the viewer is, and never
 * expose it as a server action.
 */
export async function getCandidateEscrowBalance(
  candidateId: string,
): Promise<CandidateEscrowBalance> {
  const result: CandidateEscrowBalance = { ...EMPTY, byElection: {}, error: null };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("campaign_pledges")
      .select("election_id, amount, status")
      .eq("candidate_id", candidateId)
      .in("status", ["pending", "released", "disbursed"]);

    if (error) {
      if (isMissingRelation(error)) return result;
      return { ...result, error: error.message };
    }

    for (const row of data ?? []) {
      const bucket =
        row.status === "released"
          ? "available"
          : row.status === "pending"
            ? "locked"
            : "disbursed";
      const amount = parseAmount(row.amount);
      const race = (result.byElection[row.election_id] ??= emptyEscrowBalance());
      race[bucket] += amount;
      result[bucket] += amount;
    }
    return result;
  } catch (caught) {
    console.error("getCandidateEscrowBalance failed.", caught);
    return { ...result, error: "Could not load your campaign vault." };
  }
}
