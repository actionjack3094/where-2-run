export const FEC_FORM_1_HREF =
  "https://www.fec.gov/resources/cms-content/documents/fecfrm1.pdf";

export const TEXAS_FORM_CTA_HREF =
  "https://www.ethics.state.tx.us/data/forms/coh/cta.pdf";

export type TreasurerFilingLink = {
  href: string;
  label: string;
  cardTitle: string;
  detail: string;
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isTexasElection(state: string | null | undefined) {
  const value = normalized(state);
  return value === "tx" || value === "texas";
}

export function isFederalElection(level: string | null | undefined) {
  return normalized(level) === "federal";
}

export function jurisdictionFromElectionSlug(
  slug: string | null | undefined,
): "federal" | "texas" | null {
  const value = normalized(slug);
  if (!value) return null;
  if (value.includes("us-house") || value.includes("us-senate")) return "federal";
  if (value.includes("tx-")) return "texas";
  return null;
}

function federalFilingLink(): TreasurerFilingLink {
  return {
    href: FEC_FORM_1_HREF,
    label: "FEC Form 1",
    cardTitle: "Federal Election Commission Requirements",
    detail:
      "Statement of Organization. File it with the Federal Election Commission before this committee accepts contributions.",
  };
}

function texasFilingLink(): TreasurerFilingLink {
  return {
    href: TEXAS_FORM_CTA_HREF,
    label: "TEC Form CTA",
    cardTitle: "Texas Ethics Commission Requirements",
    detail:
      "Appointment of a Campaign Treasurer by a Candidate. File it with the Texas Ethics Commission before this campaign accepts contributions.",
  };
}

export function treasurerFilingLink(input: {
  slug?: string | null;
  level?: string | null;
  state?: string | null;
}): TreasurerFilingLink | null {
  const fromSlug = jurisdictionFromElectionSlug(input.slug);
  if (fromSlug === "federal" || isFederalElection(input.level)) {
    return federalFilingLink();
  }

  if (fromSlug === "texas" || isTexasElection(input.state)) {
    return texasFilingLink();
  }

  return null;
}
