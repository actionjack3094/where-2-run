export const TIER2_DOCUMENT_TYPES = [
  { id: "drivers_license", label: "Driver's license or state ID" },
  { id: "utility_bill", label: "Utility bill" },
  { id: "lease_agreement", label: "Lease or mortgage statement" },
  { id: "voter_registration", label: "Voter registration card" },
] as const;

export type Tier2DocumentTypeId = (typeof TIER2_DOCUMENT_TYPES)[number]["id"];

export function isTier2DocumentType(value: string | null | undefined): value is Tier2DocumentTypeId {
  return TIER2_DOCUMENT_TYPES.some((type) => type.id === value);
}
