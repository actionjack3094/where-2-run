import { supabase } from "@/lib/db/supabase";
import {
  cosineSimilarity,
  normalizeVector,
  parseVector,
  similarityToPercent,
} from "@/lib/ideology/vector";
import type {
  Coalition,
  CoalitionMember,
  CoalitionMemberStatus,
  IdeologyVector,
} from "@/types/database.types";

export const COALITION_NAME_MAX = 80;
export const COALITION_CHARTER_MIN = 20;
export const COALITION_CHARTER_MAX = 2000;
export const ALIGNMENT_FLOOR = 0.55;

export type CandidateBrief = {
  id: string;
  username: string;
  ideology_vector: IdeologyVector | string | null;
  target_district_id: string | null;
  district_name: string | null;
};

export type MemberSeat = CoalitionMember & {
  candidate: CandidateBrief | null;
};

export type CoalitionDeskItem = Coalition & {
  founder: Pick<CandidateBrief, "id" | "username"> | null;
  members: MemberSeat[];
  centroid: number[];
  alignmentPct: number | null;
};

export type CoalitionDirectory = {
  coalitions: CoalitionDeskItem[];
  candidates: CandidateBrief[];
  error: string | null;
};

export type RankedCoalition = CoalitionDeskItem & {
  alignmentPct: number;
  similarity: number;
};

export type RankedCandidate = CandidateBrief & {
  alignmentPct: number;
  similarity: number;
  crossDistrict: boolean;
};

type DistrictNameRow = { id: string; name: string };
type UserBriefRow = Pick<
  CandidateBrief,
  "id" | "username" | "ideology_vector" | "target_district_id"
>;

export function isMissingRelation(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table/i.test(message) ||
    /does not exist/i.test(message) ||
    /schema cache/i.test(message)
  );
}

export function isActiveStatus(status: string | null | undefined) {
  return status === "active";
}

export function parseStanceVector(value: unknown): number[] {
  const parsed = parseVector(value);
  return parsed.length > 0 ? normalizeVector(parsed) : [];
}

export function meanStanceVector(vectors: number[][]): number[] {
  const usable = vectors.filter((vector) => vector.length > 0);
  if (usable.length === 0) return [];

  const acc = Array.from({ length: usable[0].length }, () => 0);
  for (const vector of usable) {
    const normalized = normalizeVector(vector);
    for (let index = 0; index < acc.length; index++) {
      acc[index] += normalized[index] ?? 0;
    }
  }
  return acc.map((value) => value / usable.length);
}

function districtNameById(rows: DistrictNameRow[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

function toCandidateBrief(
  row: UserBriefRow,
  districts: Map<string, string>,
): CandidateBrief {
  return {
    id: row.id,
    username: row.username,
    ideology_vector: row.ideology_vector,
    target_district_id: row.target_district_id,
    district_name: row.target_district_id
      ? (districts.get(row.target_district_id) ?? null)
      : null,
  };
}

export async function loadCoalitionDirectory(): Promise<CoalitionDirectory> {
  const [
    { data: coalitionRows, error: coalitionError },
    { data: memberRows, error: memberError },
    { data: userRows, error: userError },
    { data: districtRows, error: districtError },
  ] = await Promise.all([
    supabase.from("coalitions").select("*").order("created_at", { ascending: false }),
    supabase.from("coalition_members").select("*"),
    supabase
      .from("users")
      .select("id, username, ideology_vector, target_district_id")
      .order("username"),
    supabase.from("districts").select("id, name"),
  ]);

  const firstError = coalitionError ?? memberError ?? userError ?? districtError;
  if (firstError) {
    if (isMissingRelation(firstError)) {
      return { coalitions: [], candidates: [], error: null };
    }
    return { coalitions: [], candidates: [], error: firstError.message };
  }

  const districts = districtNameById((districtRows ?? []) as DistrictNameRow[]);
  const candidates = ((userRows ?? []) as UserBriefRow[]).map((row) =>
    toCandidateBrief(row, districts),
  );
  const candidateById = new Map(candidates.map((row) => [row.id, row]));
  const members = (memberRows ?? []) as CoalitionMember[];

  const coalitions: CoalitionDeskItem[] = ((coalitionRows ?? []) as Coalition[]).map(
    (coalition) => {
      const seats: MemberSeat[] = members
        .filter((member) => member.coalition_id === coalition.id)
        .map((member) => ({
          ...member,
          candidate: candidateById.get(member.candidate_id) ?? null,
        }));

      const activeVectors = seats
        .filter((seat) => isActiveStatus(seat.status))
        .map((seat) => parseStanceVector(seat.candidate?.ideology_vector))
        .filter((vector) => vector.length > 0);

      const founder = candidateById.get(coalition.founder_id) ?? null;
      const centroid = meanStanceVector(
        activeVectors.length > 0
          ? activeVectors
          : [parseStanceVector(founder?.ideology_vector)].filter(
              (vector) => vector.length > 0,
            ),
      );

      return {
        ...coalition,
        founder: founder ? { id: founder.id, username: founder.username } : null,
        members: seats,
        centroid,
        alignmentPct: null,
      };
    },
  );

  return { coalitions, candidates, error: null };
}

export async function loadActiveCoalitionsForCandidate(
  candidateId: string,
): Promise<{ coalitions: Coalition[]; error: string | null }> {
  const { data: memberships, error: memberError } = await supabase
    .from("coalition_members")
    .select("coalition_id, status")
    .eq("candidate_id", candidateId)
    .eq("status", "active");

  if (memberError) {
    if (isMissingRelation(memberError)) return { coalitions: [], error: null };
    return { coalitions: [], error: memberError.message };
  }

  const ids = [
    ...new Set(
      ((memberships ?? []) as Pick<CoalitionMember, "coalition_id">[]).map(
        (row) => row.coalition_id,
      ),
    ),
  ];
  if (ids.length === 0) return { coalitions: [], error: null };

  const { data: coalitionRows, error: coalitionError } = await supabase
    .from("coalitions")
    .select("*")
    .in("id", ids)
    .order("name");

  if (coalitionError) {
    if (isMissingRelation(coalitionError)) return { coalitions: [], error: null };
    return { coalitions: [], error: coalitionError.message };
  }

  return { coalitions: (coalitionRows ?? []) as Coalition[], error: null };
}

export function membershipFor(
  coalition: CoalitionDeskItem,
  candidateId: string | null,
): MemberSeat | null {
  if (!candidateId) return null;
  return coalition.members.find((member) => member.candidate_id === candidateId) ?? null;
}

export function isActiveMember(coalition: CoalitionDeskItem, candidateId: string | null) {
  const seat = membershipFor(coalition, candidateId);
  return Boolean(seat && isActiveStatus(seat.status));
}

export function canInviteTo(coalition: CoalitionDeskItem, candidateId: string | null) {
  return isActiveMember(coalition, candidateId);
}

export function rankRecommendedCoalitions(
  viewerId: string,
  viewerVector: number[],
  coalitions: CoalitionDeskItem[],
): RankedCoalition[] {
  const normalizedViewer = viewerVector.length > 0 ? normalizeVector(viewerVector) : [];

  return coalitions
    .filter((coalition) => {
      const seat = membershipFor(coalition, viewerId);
      return !seat || seat.status === "pending";
    })
    .map((coalition) => {
      const similarity =
        normalizedViewer.length > 0 && coalition.centroid.length > 0
          ? cosineSimilarity(normalizedViewer, coalition.centroid)
          : 0;
      return {
        ...coalition,
        similarity,
        alignmentPct: similarityToPercent(similarity),
      };
    })
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return b.created_at.localeCompare(a.created_at);
    });
}

export function rankAlignedCandidates(
  viewerId: string,
  referenceVector: number[],
  viewerDistrictId: string | null,
  occupiedIds: Set<string>,
  candidates: CandidateBrief[],
): RankedCandidate[] {
  const normalized =
    referenceVector.length > 0 ? normalizeVector(referenceVector) : [];

  return candidates
    .filter((candidate) => candidate.id !== viewerId && !occupiedIds.has(candidate.id))
    .map((candidate) => {
      const vector = parseStanceVector(candidate.ideology_vector);
      const similarity =
        normalized.length > 0 && vector.length > 0
          ? cosineSimilarity(normalized, vector)
          : 0;
      const crossDistrict = Boolean(
        candidate.target_district_id &&
          viewerDistrictId &&
          candidate.target_district_id !== viewerDistrictId,
      );
      return {
        ...candidate,
        similarity,
        alignmentPct: similarityToPercent(similarity),
        crossDistrict,
      };
    })
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      if (a.crossDistrict !== b.crossDistrict) return a.crossDistrict ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
}

export function formatAlignment(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}% aligned`;
}

export function statusLabel(status: CoalitionMemberStatus | string) {
  return status === "active" ? "Seated" : "Invited";
}
