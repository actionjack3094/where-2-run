import { compactCongressionalLabel } from "@/lib/campaign/targets";

/** Verified in-district upvotes required to promote a prospect to Contender. */
export const IN_DISTRICT_VOTE_GOAL = 50;

export type CampaignRank = "PROSPECTIVE" | "CONTENDER";

export type UnlockStageId = "floor" | "contender" | "filing";

export type UnlockProgress = {
  current: number;
  goal: number;
  label: string;
  caption: string;
};

export type UnlockStage = {
  id: UnlockStageId;
  step: 1 | 2 | 3;
  title: string;
  lockName: string;
  statusLabel: string;
  locked: boolean;
  unlocks: string;
  progress: UnlockProgress | null;
  lockCopy: string | null;
  badge: "ON THE BALLOT" | null;
};

export type CampaignUnlocks = {
  officeLabel: string | null;
  header: string;
  filingFee: number | null;
  filingFeeLabel: string | null;
  rank: CampaignRank;
  filed: boolean;
  stages: [UnlockStage, UnlockStage, UnlockStage];
};

export type CampaignUnlockInput = {
  officeLabel: string | null;
  inDistrictVotes: number;
  pledged: number;
  filingFee: number | null;
  filed: boolean;
};

/** First positive dollar amount in a statutory filing-fee string, such as "$3,125 statutory filing fee". */
export function parseStatutoryFilingFee(value: unknown): number | null {
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "filing_fee" in value
        ? (value as { filing_fee?: unknown }).filing_fee
        : value;
  if (typeof text === "number") {
    return Number.isFinite(text) && text > 0 ? text : null;
  }
  if (typeof text !== "string") return null;
  const match = text.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Race header such as `U.S. House · TX-10`. */
export function exploringOfficeLabel(input: {
  officeName: string;
  state?: string | null;
  district?: string | null;
  ocdId?: string | null;
}): string {
  const compact = compactCongressionalLabel(input.ocdId);
  if (compact) {
    const house = compact.match(/^(U\.S\. House)\s+(.+)$/);
    if (house) return `${house[1]} · ${house[2]}`;
    return compact;
  }
  const office = input.officeName.trim() || "Office";
  const state = (input.state ?? "").trim().toUpperCase();
  const district = (input.district ?? "").trim();
  const seat = state && district ? `${state}-${district}` : state || district;
  return seat ? `${office} · ${seat}` : office;
}

export function campaignUnlocks(input: CampaignUnlockInput): CampaignUnlocks {
  const votes = clampCount(input.inDistrictVotes);
  const pledged = clampMoney(input.pledged);
  const filingFee =
    input.filingFee != null && Number.isFinite(input.filingFee) && input.filingFee > 0
      ? clampMoney(input.filingFee)
      : null;
  const filed = input.filed === true;
  const officeLabel = input.officeLabel?.trim() || null;
  const contender = votes >= IN_DISTRICT_VOTE_GOAL;
  const feeMet = filingFee != null && pledged >= filingFee;
  const votesLeft = IN_DISTRICT_VOTE_GOAL - votes;
  const dollarsLeft = filingFee == null ? null : clampMoney(filingFee - pledged);

  const floor: UnlockStage = {
    id: "floor",
    step: 1,
    title: "District Floor Access",
    lockName: "Unlocked by Default",
    statusLabel: "Active · Complete",
    locked: false,
    unlocks:
      "Ability to post official policy statements and respond to constituent Agenda Queue topics in this district.",
    progress: null,
    lockCopy: null,
    badge: null,
  };

  const promotion: UnlockStage = {
    id: "contender",
    step: 2,
    title: "Contender Promotion",
    lockName: "In-District Resonance Lock",
    statusLabel: contender ? "Unlocked" : "Locked",
    locked: !contender,
    unlocks:
      "Upgrades status from PROSPECTIVE to CONTENDER. Guarantees priority placement in the district's My Ballot algorithmic feed.",
    progress: {
      current: votes,
      goal: IN_DISTRICT_VOTE_GOAL,
      label: `${votes.toLocaleString("en-US")} / ${IN_DISTRICT_VOTE_GOAL}`,
      caption: "Verified In-District Resonance",
    },
    lockCopy: contender
      ? null
      : `Earn ${votesLeft.toLocaleString("en-US")} more in-district votes to unlock My Ballot priority`,
    badge: null,
  };

  const filing: UnlockStage = {
    id: "filing",
    step: 3,
    title: "Filing Fee & Escrow Disbursement",
    lockName: "Financial Lock",
    statusLabel: feeMet ? "Unlocked" : "Locked",
    locked: !feeMet,
    unlocks:
      "Unlocks disbursement of conditional escrow funds to cover official Secretary of State filing fees. Unlocks the verified gold ON THE BALLOT badge once filed.",
    progress: {
      current: pledged,
      goal: filingFee ?? 0,
      label:
        filingFee == null
          ? `${usd(pledged)} raised`
          : `${usd(pledged)} / ${usd(filingFee)} Raised`,
      caption: "Conditional Escrow Pledges",
    },
    lockCopy: feeMet
      ? null
      : dollarsLeft == null
        ? "The statutory filing fee for this office is not on file yet."
        : `Raise ${usd(dollarsLeft)} more to unlock escrow filing fee distribution.`,
    badge: filed ? "ON THE BALLOT" : null,
  };

  return {
    officeLabel,
    header: officeLabel ? `Exploring Campaign: ${officeLabel}` : "Exploring Campaign",
    filingFee,
    filingFeeLabel: filingFee == null ? null : usd(filingFee),
    rank: contender ? "CONTENDER" : "PROSPECTIVE",
    filed,
    stages: [floor, promotion, filing],
  };
}

function clampCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function clampMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

function usd(amount: number) {
  const numeric = clampMoney(amount);
  const whole = Math.abs(numeric - Math.round(numeric)) < 0.001;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}
