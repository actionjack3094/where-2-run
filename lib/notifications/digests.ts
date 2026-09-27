import { checkLocalEligibility } from "@/lib/civic-fencing";
import { siteOrigin } from "@/lib/site";

export type DigestKind = "debate_countdown" | "local_challenge";

export type AlertDebate = {
  id: string;
  topic: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  ocdId: string | null;
  candidateAId: string | null;
  candidateBId: string | null;
};

export type AlertConstituent = {
  id: string;
  ocdIdentifiers: readonly string[];
};

const HOUR = 60 * 60 * 1000;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function hoursUntil(expiresAt: string, now: Date) {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return 0;
  return Math.max(1, Math.ceil((expires - now.getTime()) / HOUR));
}

export function countdownDebates(debates: readonly AlertDebate[], now: Date) {
  const end = now.getTime() + 24 * HOUR;
  return debates.filter((debate) => {
    if (debate.status !== "active" && debate.status !== "voting") return false;
    const expires = new Date(debate.expiresAt).getTime();
    return Number.isFinite(expires) && expires > now.getTime() && expires <= end;
  });
}

export function freshChallenges(debates: readonly AlertDebate[], now: Date) {
  const start = now.getTime() - 24 * HOUR;
  return debates.filter((debate) => {
    if (debate.status !== "matching" && debate.status !== "active") return false;
    const created = new Date(debate.createdAt).getTime();
    return Number.isFinite(created) && created >= start && created <= now.getTime();
  });
}

export function constituentsInDistrict(
  people: readonly AlertConstituent[],
  ocdId: string | null | undefined,
  excludeIds: readonly string[] = [],
) {
  const excluded = new Set(excludeIds);
  return people.filter(
    (person) =>
      !excluded.has(person.id) && checkLocalEligibility(person.ocdIdentifiers, ocdId),
  );
}

export function digestSubject(kind: DigestKind, districtLabel: string) {
  if (kind === "debate_countdown") {
    return `24-hour countdown in ${districtLabel}`;
  }
  return `A local challenge is live in ${districtLabel}`;
}

export function digestCopy(input: {
  kind: DigestKind;
  topic: string;
  districtLabel: string;
  hoursRemaining?: number;
}) {
  const topic = input.topic.trim() || "the open question";
  if (input.kind === "debate_countdown") {
    const hours = input.hoursRemaining ?? 24;
    return `The floor on “${topic}” closes in ${hours} hour${hours === 1 ? "" : "s"} for constituents of ${input.districtLabel}.`;
  }
  return `A candidate opened a challenge on “${topic}” in ${input.districtLabel}. Only verified constituents of that district are on this list.`;
}

export function digestHtml(input: {
  kind: DigestKind;
  topic: string;
  districtLabel: string;
  debateId: string;
  hoursRemaining?: number;
}) {
  const message = digestCopy(input);
  const url = `${siteOrigin()}/debates/${input.debateId}`;
  return `<p>${escapeHtml(message)}</p><p><a href="${url}">${escapeHtml(url)}</a></p>`;
}
