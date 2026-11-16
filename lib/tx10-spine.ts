export const LENA_CANDIDATE_HREF = "/candidates/c1111111-1111-1111-1111-111111111111";

export const TX10_BOARD = [
  {
    rank: 1,
    name: "Caleb Nguyen",
    ar: 1410,
    match: 95,
    escrow: "$3,125 / $3,125 Escrow Funded",
    href: "/debates",
  },
  {
    rank: 2,
    name: "Lena Ortiz",
    ar: 1340,
    match: 92,
    escrow: "$1,850 / $3,125 Escrow Pledged",
    href: LENA_CANDIDATE_HREF,
  },
  {
    rank: 3,
    name: "Avery Chen",
    ar: 1245,
    match: 84,
    escrow: "Escrow Locked (Needs 1,300 AR)",
    href: "/soapbox",
  },
] as const;

export const TX10_ISSUES = [
  {
    id: "zoning",
    title: "Federal Zoning & Housing Density Mandates",
    content:
      "Require a density bonus only where a city already has transit, water, and an open classroom, and publish the displacement count before another federally backed unit is approved.",
    upvotes: 142,
  },
  {
    id: "i35",
    title: "Cap the I-35 expansion before it cuts East Austin",
    content: "Publish the displacement count and a local-hire rule before another lane opens through TX-10 neighborhoods.",
    upvotes: 118,
  },
  {
    id: "hospitals",
    title: "Keep rural emergency rooms open from Bastrop to Brenham",
    content: "The filing fee debate should start with a floor for hospitals that serve the western half of the district.",
    upvotes: 118,
  },
  {
    id: "tax",
    title: "Publish school-bond math before the next property-tax cycle",
    content: "Voters asked for the payoff date on every bond that shows up on a TX-10 homestead bill.",
    upvotes: 87,
  },
] as const;
