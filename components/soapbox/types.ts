export type SoapboxLens = "candidate" | "voter";

export type SoapboxPost = {
  id: string;
  name: string;
  text: string;
  lens: SoapboxLens;
  badge: string | null;
  matchPercent: number | null;
  district: string;
  zip: string;
  clip: boolean;
  href?: string;
};

export type SoapboxViewer = {
  name: string;
  district: string;
  zip: string;
};
