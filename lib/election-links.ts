export type ElectionLinkRow = {
  id: string;
  slug: string;
  office_name: string;
  district_id: string | null;
};

export const ELECTION_LINK_COLUMNS = "id, slug, office_name, district_id" as const;

export function electionProfileHref(slug: string) {
  return `/elections/${slug}/profile`;
}

export function resolveElectionLink(
  elections: ElectionLinkRow[],
  keys: { electionId?: string | null; districtId?: string | null },
): { slug: string; officeName: string } | null {
  const electionId = keys.electionId?.trim() || null;
  const districtId = keys.districtId?.trim() || null;

  if (electionId) {
    const match = elections.find((row) => row.id === electionId);
    if (match) return { slug: match.slug, officeName: match.office_name };
  }

  if (districtId) {
    const match = elections.find(
      (row) => row.district_id === districtId || row.id === districtId,
    );
    if (match) return { slug: match.slug, officeName: match.office_name };
  }

  return null;
}
