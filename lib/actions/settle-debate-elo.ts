import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/types/database.types";

type AdminClient = SupabaseClient<AppDatabase>;

/**
 * Placeholder for tournament adjudication.
 * Spectator rows in debate_votes are telemetry and are not a match result.
 * Wire calculateDebateElo here once an official result exists.
 */
export async function settleDebateElo(_admin: AdminClient, _debateId: string) {
  return null;
}
