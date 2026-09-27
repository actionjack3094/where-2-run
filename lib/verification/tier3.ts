const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{3,63}$/;
const SSN = /^\d{3}-?\d{2}-?\d{4}$/;

export function governmentIdReferenceError(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (SSN.test(trimmed.replace(/\s/g, "")) || (digits.length >= 9 && /^[\d\s-]+$/.test(trimmed))) {
    return "Submit a review reference, not a full government ID number.";
  }
  if (!REFERENCE.test(trimmed)) {
    return "Enter a 4–64 character reference using letters, numbers, spaces, dots, or hyphens.";
  }
  return null;
}

export function ballotNameError(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    return "Enter the name as it appears on the local ballot.";
  }
  return null;
}

export function ballotOcdError(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("ocd-division/country:")) {
    return "Enter the OCD-ID for the seat on the local ballot.";
  }
  return null;
}
