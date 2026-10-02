import { loadDistrictCentroids } from "@/lib/civic/lookup-address";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  euclideanAxisDistance,
  stanceFromDistrictMedian,
  stanceFromStoredVector,
  type AxisStance,
} from "@/lib/ideology/axes";

export interface IdeologyScores {
  economic?: number;
  social?: number;
  governance?: number;
}

export function calculateIdeologicalDistance(a: AxisStance, b: AxisStance): number {
  return euclideanAxisDistance(a, b);
}

export async function matchUserToTournaments(userId: string) {
  const admin = createAdminClient();
  const [ideologyQuery, profileQuery, electionsQuery, centroids] = await Promise.all([
    admin.from("user_ideologies").select("vector_data").eq("user_id", userId).maybeSingle(),
    admin.from("users").select("stance_vector").eq("id", userId).maybeSingle(),
    admin.from("elections").select("id, slug, office_name, district_id, ocd_id"),
    loadDistrictCentroids(),
  ]);

  if (ideologyQuery.error) throw new Error(ideologyQuery.error.message);
  if (profileQuery.error) throw new Error(profileQuery.error.message);
  if (electionsQuery.error) throw new Error(electionsQuery.error.message);

  const stance =
    stanceFromStoredVector(ideologyQuery.data?.vector_data) ??
    stanceFromStoredVector(profileQuery.data?.stance_vector);
  if (!stance) {
    throw new Error("User ideology profile not found. Complete deck questions first.");
  }

  const elections = electionsQuery.data ?? [];
  if (elections.length === 0) return [];

  const distanceByDistrict = new Map(
    centroids.flatMap((district) => {
      const centroid = stanceFromDistrictMedian(district.medianIdeologyVector);
      if (!centroid) return [];
      return [[district.id, euclideanAxisDistance(stance, centroid)] as const];
    }),
  );
  const distanceByOcd = new Map(
    centroids.flatMap((district) => {
      const centroid = stanceFromDistrictMedian(district.medianIdeologyVector);
      const ocdId = district.ocdId?.trim().toLowerCase();
      if (!centroid || !ocdId) return [];
      return [[ocdId, euclideanAxisDistance(stance, centroid)] as const];
    }),
  );

  return elections
    .map((election) => {
      const byDistrict = election.district_id
        ? distanceByDistrict.get(election.district_id)
        : undefined;
      const byOcd = election.ocd_id
        ? distanceByOcd.get(election.ocd_id.trim().toLowerCase())
        : undefined;
      const distance = byDistrict ?? byOcd;
      if (distance == null) return null;
      return {
        election: {
          ...election,
          title: election.office_name,
        },
        distance,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((left, right) => left.distance - right.distance || left.election.id.localeCompare(right.election.id));
}
