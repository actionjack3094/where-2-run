/** Officially filed when a campaign target is filed, an FEC id is on file, or the primary nominee is set. */
export function isOfficiallyFiled(input: {
  officialCandidateId?: string | null;
  status?: string | null;
  isNominee?: boolean | null;
}) {
  return Boolean(input.officialCandidateId?.trim() || input.status === "filed" || input.isNominee);
}
