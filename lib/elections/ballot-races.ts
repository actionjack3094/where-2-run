import { matchedOfficeLabel } from "@/lib/elections/matched";
import type { VoterBallotRace } from "@/lib/elections/hub-types";
import { primaryOfficeName } from "@/lib/elections/state-directory";
import type { Primary } from "@/types/database.types";

function seatTitle(primary: Primary) {
  const label = matchedOfficeLabel({
    officeName: primaryOfficeName(primary.office_name, primary.office),
    state: primary.state,
    district: primary.district,
  });
  return /primary$/i.test(label) ? label : `${label} Primary`;
}

export function groupBallotRaces(
  primaries: Primary[],
  candidates: Map<string, VoterBallotRace["candidates"]>,
  questionByPrimary: Map<string, string>,
): VoterBallotRace[] {
  const seen = new Set<string>();
  const seats = new Map<string, Primary[]>();
  for (const primary of primaries) {
    if (seen.has(primary.id)) continue;
    seen.add(primary.id);
    const title = seatTitle(primary);
    const list = seats.get(title) ?? [];
    list.push(primary);
    seats.set(title, list);
  }

  return [...seats.values()].map((rows) => {
    const anchor = rows[0];
    const question = rows.map((row) => questionByPrimary.get(row.id)).find(Boolean) ?? null;
    const qaPrimary = rows.find((row) => questionByPrimary.has(row.id)) ?? anchor;
    const shown = new Set<string>();
    const people = rows.flatMap((row) => candidates.get(row.id) ?? []).filter((candidate) => {
      const key = `${candidate.primaryId}:${candidate.id}`;
      if (shown.has(key)) return false;
      shown.add(key);
      return true;
    });
    return {
      id: anchor.id,
      title: seatTitle(anchor),
      question,
      qaHref: `/elections/${qaPrimary.slug}`,
      candidates: people,
    };
  });
}

export function dedupeBallotRaces(races: VoterBallotRace[]) {
  const seen = new Set<string>();
  return races.filter((race) => {
    const primaryIds = [...new Set(race.candidates.map((candidate) => candidate.primaryId))];
    const keys = primaryIds.length > 0 ? primaryIds : [race.id];
    if (keys.some((id) => seen.has(id))) return false;
    for (const id of keys) seen.add(id);
    return true;
  });
}
