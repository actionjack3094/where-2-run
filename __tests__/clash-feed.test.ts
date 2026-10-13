import { describe, expect, it } from "vitest";
import {
  TEXAS_MEDICAID_CLASH,
  TEXAS_MEDICAID_DEBATE_ID,
  excerpt,
  formatOfficeTag,
  latestSideText,
  orderClashFeed,
  type ClashCard,
} from "@/lib/debates/clash-feed";

function card(patch: Partial<ClashCard> & Pick<ClashCard, "id" | "question">): ClashCard {
  return {
    officeTag: "US Senate · TX",
    href: `/debates/${patch.id}`,
    upvotes: 0,
    resonance: 0,
    questionCount: 0,
    sideA: TEXAS_MEDICAID_CLASH.sideA,
    sideB: TEXAS_MEDICAID_CLASH.sideB,
    ...patch,
  };
}

describe("clash feed", () => {
  it("formats the office tag as office then state", () => {
    expect(formatOfficeTag("U.S. Senate", "TX")).toBe("US Senate · TX");
  });

  it("keeps the first two sentences of an argument", () => {
    expect(
      excerpt(
        "Open the rolls. Pay for it with the federal match. Leave the public option as a bridge.",
      ),
    ).toBe("Open the rolls. Pay for it with the federal match.");
  });

  it("uses the latest round for each side", () => {
    const rows = [
      { authorId: "lena", round: 1, content: "Round one stance." },
      { authorId: "lena", round: 2, content: "Round two is the expansion itself." },
    ];
    expect(latestSideText("Fallback stance.", rows, "lena")).toBe("Round two is the expansion itself.");
    expect(latestSideText("Fallback stance.", rows, "caleb")).toBe("Fallback stance.");
  });

  it("pins the seeded Texas Senate Medicaid debate first", () => {
    const newer = card({ id: "newer-debate", question: "Cap homestead property-tax growth" });
    const ordered = orderClashFeed([newer]);
    expect(ordered[0]?.id).toBe(TEXAS_MEDICAID_DEBATE_ID);
    expect(ordered[0]?.sideA.name).toBe("Lena Ortiz");
    expect(ordered[0]?.sideB.name).toBe("Caleb Nguyen");
    expect(ordered.map((item) => item.id)).toEqual([TEXAS_MEDICAID_DEBATE_ID, "newer-debate"]);
  });

  it("keeps the live seeded row ahead of newer clashes", () => {
    const live = card({
      id: TEXAS_MEDICAID_DEBATE_ID,
      question: "Expand Medicaid and close the coverage gap",
      upvotes: 18,
      questionCount: 1,
    });
    const newer = card({ id: "newer-debate", question: "Weatherize the grid before the next freeze" });
    const ordered = orderClashFeed([newer, live, live]);
    expect(ordered).toHaveLength(2);
    expect(ordered[0]).toMatchObject({ id: TEXAS_MEDICAID_DEBATE_ID, upvotes: 18, questionCount: 1 });
    expect(ordered[1]?.id).toBe("newer-debate");
  });

  it("fills Lena Ortiz and Caleb Nguyen when the live row has no names", () => {
    const live = card({
      id: TEXAS_MEDICAID_DEBATE_ID,
      question: "Expand Medicaid and close the coverage gap",
      officeTag: "Primary",
      upvotes: 0,
      questionCount: 0,
      sideA: { ...TEXAS_MEDICAID_CLASH.sideA, name: "Contender", excerpt: "No argument filed yet.", tier: "pundit" },
      sideB: { ...TEXAS_MEDICAID_CLASH.sideB, name: "Contender", excerpt: "No argument filed yet.", tier: "pundit" },
    });
    const [featured] = orderClashFeed([live]);
    expect(featured?.sideA.name).toBe("Lena Ortiz");
    expect(featured?.sideB.name).toBe("Caleb Nguyen");
    expect(featured?.officeTag).toBe("US Senate · TX");
    expect(featured?.upvotes).toBe(18);
    expect(featured?.questionCount).toBe(1);
  });
});
