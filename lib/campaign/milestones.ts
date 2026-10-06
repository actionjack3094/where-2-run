export const DEBATE_GOAL = 3;
export const CIVIC_GOAL = 80;
export const ESCROW_GOAL = 25_000;

export type CampaignMilestone = {
  id: "debates" | "civic" | "escrow" | "filing";
  title: string;
  detail: string;
  current: number;
  goal: number;
  complete: boolean;
};

export function campaignMilestones(input: {
  concludedDebates: number;
  civicStanding: number;
  pledged: number;
  filed: boolean;
}): CampaignMilestone[] {
  const debates = Math.max(0, input.concludedDebates);
  const civic = Math.max(0, input.civicStanding);
  const pledged = Math.max(0, input.pledged);
  return [
    {
      id: "debates",
      title: "3 Arena Debates",
      detail: "Finish three judged matches.",
      current: debates,
      goal: DEBATE_GOAL,
      complete: debates >= DEBATE_GOAL,
    },
    {
      id: "civic",
      title: "80+ Civic Standing",
      detail: "Reach a community score of 80 in a primary you contest.",
      current: civic,
      goal: CIVIC_GOAL,
      complete: civic >= CIVIC_GOAL,
    },
    {
      id: "escrow",
      title: "Escrow Threshold Reached",
      detail: "Cross $25,000 in pledged backing.",
      current: pledged,
      goal: ESCROW_GOAL,
      complete: pledged >= ESCROW_GOAL,
    },
    {
      id: "filing",
      title: "Official Ballot Filing",
      detail: "File an official candidate ID or lock a filed seat.",
      current: input.filed ? 1 : 0,
      goal: 1,
      complete: input.filed,
    },
  ];
}
