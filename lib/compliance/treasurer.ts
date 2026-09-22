export const FEC_FORM_1_HREF =
  "https://www.fec.gov/resources/cms-content/documents/fecfrm1.pdf";

export const TEXAS_FORM_CTA_HREF =
  "https://www.ethics.state.tx.us/data/forms/coh/cta.pdf";

export type TreasurerFilingLink = {
  href: string;
  label: string;
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

export function treasurerFilingLink(input: {
  level?: string | null;
  state?: string | null;
}): TreasurerFilingLink | null {
  if (isFederalElection(input.level)) {
    return {
      href: FEC_FORM_1_HREF,
      label: "FEC Form 1",
      detail:
        "Statement of Organization. File it with the Federal Election Commission before this committee accepts contributions.",
    };
  }

  if (isTexasElection(input.state)) {
    return {
      href: TEXAS_FORM_CTA_HREF,
      label: "Texas Form CTA",
      detail:
        "Appointment of a Campaign Treasurer by a Candidate. File it with the Texas Ethics Commission before this campaign accepts contributions.",
    };
  }

  return null;
}
