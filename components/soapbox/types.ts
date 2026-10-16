export type SoapboxLens = "candidate" | "voter";

export type CandidateBadge = "CONTENDER" | "ON THE BALLOT" | "PROSPECTIVE";

export type SoapboxPost = {
  id: string;
  name: string;
  text: string;
  lens: SoapboxLens;
  badge: CandidateBadge | null;
  matchPercent: number | null;
  district: string;
  zip: string;
  clip: boolean;
};

export type SoapboxViewer = {
  name: string;
  district: string;
  zip: string;
};
