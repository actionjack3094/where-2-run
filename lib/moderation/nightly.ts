import { resolveDebate } from "@/lib/actions/debate-resolution";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import {
  debatesToFinalize,
  debatesToHold,
  debatesToRelease,
  type ExpiredFloor,
} from "@/lib/moderation/arbitration";

type DebateRow = {
  id: string;
  status: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  expires_at: string;
};

function asFloor(row: DebateRow, argumentCount: number): ExpiredFloor {
  return {
    id: row.id,
    status: row.status,
    candidateAId: row.candidate_a_id,
    candidateBId: row.candidate_b_id,
    expiresAt: row.expires_at,
    argumentCount,
  };
}

async function closeWithoutRating(
  admin: ReturnType<typeof createAdminClient>,
  debateId: string,
) {
  const { error } = await admin
    .from("debates")
    .update({ status: "completed", winner_id: null })
    .eq("id", debateId)
    .in("status", ["matching", "active"]);
  if (error) throw new Error(error.message);

  const { error: eloError } = await admin.rpc("apply_debate_elo", {
    debate_uuid: debateId,
  });
  if (eloError) throw new Error(eloError.message);
}

export async function finalizeExpiredDebates(now = new Date()) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("debates")
    .select("id, status, candidate_a_id, candidate_b_id, expires_at")
    .in("status", ["matching", "in_progress", "active", "voting", "concluded"])
    .or(`status.eq.concluded,expires_at.lte.${now.toISOString()}`);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DebateRow[];
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return { resolved: [] as string[], held: [] as string[], released: [] as string[] };

  const { data: argumentsRows, error: argumentError } = await admin
    .from("arguments")
    .select("debate_id")
    .in("debate_id", ids);
  if (argumentError) throw new Error(argumentError.message);

  const argumentCounts = new Map<string, number>();
  for (const row of argumentsRows ?? []) {
    argumentCounts.set(row.debate_id, (argumentCounts.get(row.debate_id) ?? 0) + 1);
  }

  const floors = rows.map((row) => asFloor(row, argumentCounts.get(row.id) ?? 0));

  const { data: cases, error: caseError } = await admin
    .from("arbitration_cases")
    .select("debate_id, status, holds_elo")
    .in("debate_id", ids);

  if (caseError) {
    if (!isMissingSchema(caseError)) throw new Error(caseError.message);
    const resolved = (
      await Promise.all(
        debatesToFinalize(floors, new Set(), now).map((id) => resolveDebate(id)),
      )
    ).filter((id): id is string => id !== null);
    return { resolved, held: [] as string[], released: [] as string[] };
  }

  const openHoldIds = new Set(
    (cases ?? [])
      .filter((row) => row.status === "open" && row.holds_elo)
      .map((row) => row.debate_id),
  );
  const dismissedIds = new Set(
    (cases ?? []).filter((row) => row.status === "dismissed").map((row) => row.debate_id),
  );

  const held = debatesToHold(floors, openHoldIds, dismissedIds, now);
  for (const debateId of held) {
    const { error: insertError } = await admin.from("arbitration_cases").insert({
      debate_id: debateId,
      kind: "abandoned_debate",
      status: "open",
      holds_elo: true,
    });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  }

  const releasedIds = debatesToRelease(floors, openHoldIds, dismissedIds, now);
  for (const debateId of releasedIds) {
    await closeWithoutRating(admin, debateId);
  }

  const finalizeIds = debatesToFinalize(floors, openHoldIds, now);
  const resolved = (
    await Promise.all(finalizeIds.map((id) => resolveDebate(id)))
  ).filter((id): id is string => id !== null);

  return { resolved, held, released: releasedIds };
}
