const SPEECH_MAX = 280;

export function splitBacking(grassroots: number, institutional: number) {
  const grass = Math.max(0, grassroots);
  const inst = Math.max(0, institutional);
  const total = grass + inst;
  return {
    grassroots: grass,
    institutional: inst,
    total,
    grassrootsShare: total === 0 ? 0 : grass / total,
    institutionalShare: total === 0 ? 0 : inst / total,
  };
}

export function transparencySpeech(amount: number, entityName: string) {
  const dollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
  const name = entityName.trim() || "an institution";
  const named = /^the\s/i.test(name) ? name : `the ${name}`;
  return `Accepted ${dollars} from ${named}.`.slice(0, SPEECH_MAX);
}

const OPEN_PLEDGE = new Set(["pending", "held", "vaulted", "pledged"]);

export function uncapturedCredit(pledges: { amount: number; status: string }[]) {
  return pledges
    .filter((pledge) => OPEN_PLEDGE.has(pledge.status))
    .reduce((sum, pledge) => sum + Math.max(0, pledge.amount), 0);
}

export type PledgeDecision = "accepted" | "rejected";

export function decidePledge(input: {
  status: string;
  decision: PledgeDecision;
}): { status: PledgeDecision; unbought: boolean; publish: boolean } | { error: string } {
  if (input.status !== "pending") return { error: "That pledge is no longer waiting." };
  if (input.decision === "rejected") return { status: "rejected", unbought: true, publish: false };
  return { status: "accepted", unbought: false, publish: true };
}
