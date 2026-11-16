import type { SoapboxPost } from "@/components/soapbox/types";
import { LENA_CANDIDATE_HREF } from "@/lib/tx10-spine";

const HOUSE = "U.S. House TX-10";

/** Candidate order is unsorted on purpose so the feed can lift verified runners. */
export const SEED_POSTS: SoapboxPost[] = [
  {
    id: "seed-jordan",
    name: "Jordan Hale",
    text: "Housing costs are the race. The first session should cap local fees that never show up on a mailer.",
    lens: "candidate",
    badge: "PROSPECT · 1,080 AR",
    matchPercent: 62,
    district: HOUSE,
    zip: "78701",
    clip: false,
  },
  {
    id: "seed-mina",
    name: "Lena Ortiz",
    text: "The hospital levy is the quiet vote on this ballot. Keep the emergency room open and publish the bond math.",
    lens: "candidate",
    badge: "CONTENDER · 1,340 AR",
    href: LENA_CANDIDATE_HREF,
    matchPercent: 92,
    district: HOUSE,
    zip: "78701",
    clip: false,
  },
  {
    id: "seed-avery",
    name: "Avery Chen",
    text: "Fund the transit line that already has riders before drawing a new map.",
    lens: "candidate",
    badge: "CHALLENGER · 1,245 AR",
    matchPercent: 84,
    district: HOUSE,
    zip: "78746",
    clip: true,
  },
  {
    id: "seed-chris",
    name: "Chris Patel",
    text: "School bonds should expire when the project does. That is the stance I will defend.",
    lens: "candidate",
    badge: "PROSPECT · 1,080 AR",
    matchPercent: 54,
    district: HOUSE,
    zip: "78704",
    clip: false,
  },
  {
    id: "seed-foreign",
    name: "Sam Ruiz",
    text: "This note belongs to another district and should stay off a TX-10 voter floor.",
    lens: "voter",
    badge: null,
    matchPercent: null,
    district: "U.S. House CA-12",
    zip: "94107",
    clip: false,
  },
];
