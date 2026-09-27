import { createAdminClient } from "@/lib/db/supabase-admin";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { formatOcdDivision, normalizeOcdId } from "@/lib/civic-fencing";
import { sendDistrictDigest } from "@/lib/actions/emails";
import {
  constituentsInDistrict,
  countdownDebates,
  digestCopy,
  freshChallenges,
  hoursUntil,
  type AlertDebate,
  type DigestKind,
} from "@/lib/notifications/digests";

const SEND_CAP = 40;

type DebateRow = {
  id: string;
  topic: string;
  status: string;
  expires_at: string;
  created_at: string;
  candidate_a_id: string | null;
  candidate_b_id: string | null;
  election_id: string | null;
};

function toAlert(row: DebateRow, ocdId: string | null): AlertDebate {
  return {
    id: row.id,
    topic: row.topic,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    ocdId,
    candidateAId: row.candidate_a_id,
    candidateBId: row.candidate_b_id,
  };
}

export async function runDistrictAlerts(now = new Date()) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("debates")
    .select(
      "id, topic, status, expires_at, created_at, candidate_a_id, candidate_b_id, election_id",
    )
    .in("status", ["matching", "active", "voting"]);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DebateRow[];
  const electionIds = [...new Set(rows.map((row) => row.election_id).filter(Boolean))] as string[];
  const ocdByElection = new Map<string, string>();

  if (electionIds.length > 0) {
    const { data: elections, error: electionError } = await admin
      .from("elections")
      .select("id, ocd_id")
      .in("id", electionIds);
    if (electionError && !isMissingSchema(electionError)) throw new Error(electionError.message);
    for (const election of elections ?? []) {
      if (election.ocd_id) ocdByElection.set(election.id, election.ocd_id);
    }
  }

  const alerts = rows.map((row) =>
    toAlert(row, row.election_id ? (ocdByElection.get(row.election_id) ?? null) : null),
  );

  const queued = [
    ...countdownDebates(alerts, now).map((debate) => ({
      debate,
      kind: "debate_countdown" as const,
    })),
    ...freshChallenges(alerts, now).map((debate) => ({
      debate,
      kind: "local_challenge" as const,
    })),
  ].filter((item) => item.debate.ocdId);

  let sent = 0;
  let skipped = 0;
  const emailConfigured = Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim(),
  );

  for (const item of queued) {
    if (sent >= SEND_CAP) break;
    const ocdId = item.debate.ocdId;
    if (!ocdId) continue;

    const { data: people, error: peopleError } = await admin
      .from("users")
      .select("id, ocd_identifiers")
      .contains("ocd_identifiers", [ocdId]);

    if (peopleError) {
      if (isMissingSchema(peopleError)) continue;
      throw new Error(peopleError.message);
    }

    const audience = constituentsInDistrict(
      (people ?? []).map((person) => ({
        id: person.id,
        ocdIdentifiers: person.ocd_identifiers ?? [],
      })),
      ocdId,
      [item.debate.candidateAId, item.debate.candidateBId].filter(
        (id): id is string => Boolean(id),
      ),
    );

    const { data: prior, error: priorError } = await admin
      .from("notification_dispatches")
      .select("recipient_id")
      .eq("kind", item.kind)
      .eq("debate_id", item.debate.id);

    if (priorError) {
      if (isMissingSchema(priorError)) return { sent, skipped, emailConfigured, pending: queued.length };
      throw new Error(priorError.message);
    }

    const already = new Set((prior ?? []).map((row) => row.recipient_id));
    const districtLabel = formatOcdDivision(ocdId) ?? normalizeOcdId(ocdId);
    const hoursRemaining =
      item.kind === "debate_countdown" ? hoursUntil(item.debate.expiresAt, now) : undefined;

    for (const person of audience) {
      if (sent >= SEND_CAP) break;
      if (already.has(person.id)) {
        skipped += 1;
        continue;
      }
      if (!emailConfigured) continue;

      await sendDistrictDigest(
        {
          recipientId: person.id,
          kind: item.kind,
          topic: item.debate.topic,
          districtLabel,
          debateId: item.debate.id,
          hoursRemaining,
        },
        process.env.CRON_SECRET ?? "",
      );

      const { error: receiptError } = await admin.from("notification_dispatches").insert({
        kind: item.kind,
        debate_id: item.debate.id,
        recipient_id: person.id,
        ocd_id: ocdId,
      });
      if (receiptError && receiptError.code !== "23505") {
        throw new Error(receiptError.message);
      }
      sent += 1;
    }
  }

  return {
    sent,
    skipped,
    emailConfigured,
    considered: queued.length,
    preview: queued.slice(0, 3).map((item) => ({
      kind: item.kind satisfies DigestKind,
      debateId: item.debate.id,
      copy: digestCopy({
        kind: item.kind,
        topic: item.debate.topic,
        districtLabel: formatOcdDivision(item.debate.ocdId) ?? "this district",
        hoursRemaining:
          item.kind === "debate_countdown" ? hoursUntil(item.debate.expiresAt, now) : undefined,
      }),
    })),
  };
}
