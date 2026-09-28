export const CANDIDACY_PROOF_BUCKET = "candidacy-proofs";
export const CANDIDACY_PDF_MAX_BYTES = 10 * 1024 * 1024;

export const ESCROW_STATUSES = ["accumulating", "verification_pending", "released"] as const;

export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

const CANDIDATE_ID = /^[A-Za-z0-9][A-Za-z0-9-]{3,31}$/;
const SSN = /^\d{3}-?\d{2}-?\d{4}$/;
const COMMITTEE_NAME = /^[A-Za-z0-9][A-Za-z0-9 &'.,()-]{1,119}$/;
const DOCUMENT_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export function normalizeEscrowStatus(value: string | null | undefined): EscrowStatus {
  if (value === "verification_pending" || value === "released") return value;
  return "accumulating";
}

export function officialCandidateIdError(value: string) {
  const trimmed = value.trim();
  const compact = trimmed.replace(/\s/g, "");
  if (SSN.test(compact) || (/^\d+$/.test(compact) && compact.length === 9)) {
    return "Enter an FEC candidate ID or state election board ID, not a Social Security number.";
  }
  if (!CANDIDATE_ID.test(trimmed)) {
    return "Enter the FEC candidate ID or the state election board ID.";
  }
  return null;
}

export function normalizeOfficialCandidateId(value: string) {
  return value.trim().toUpperCase();
}

export function committeeNameError(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (/[\u0000-\u001F]/.test(value) || !COMMITTEE_NAME.test(trimmed)) {
    return "Enter the official campaign committee name.";
  }
  return null;
}

export function normalizeCommitteeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function officialDonationHref(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  const allowed =
    host === "actblue.com" ||
    host.endsWith(".actblue.com") ||
    host === "winred.com" ||
    host.endsWith(".winred.com");
  if (!allowed) return null;

  return url.toString();
}

export function donationUrlError(value: string) {
  if (!officialDonationHref(value)) {
    return "Enter the campaign's https ActBlue or WinRed page.";
  }
  return null;
}

export function candidacyDocumentPath(documentUrl: string, userId: string, targetId: string) {
  const raw = documentUrl.trim();
  if (!raw || raw.includes("..") || raw.includes("\\") || raw.includes("\0")) return null;

  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
    const marker = `/${CANDIDACY_PROOF_BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    path = decodeURIComponent(url.pathname.slice(index + marker.length));
  }

  path = path.replace(/^\/+/, "");
  if (!DOCUMENT_PATH.test(path)) return null;

  const [owner, target] = path.split("/");
  if (owner !== userId || target !== targetId) return null;
  return path;
}

export function pdfHeaderError(bytes: Uint8Array) {
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== "%PDF-") return "Attach a PDF of the filed Statement of Candidacy.";
  return null;
}
