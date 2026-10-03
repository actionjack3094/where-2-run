import { describe, expect, it } from "vitest";
import { agendaPromptText, cleanAgendaContent, cleanAgendaTitle } from "@/lib/platform/agenda";

describe("district agenda", () => {
  it("keeps a title and description inside the character limits", () => {
    expect(cleanAgendaTitle("  Housing  ")).toBe("Housing");
    expect(cleanAgendaTitle("")).toBeNull();
    expect(cleanAgendaTitle("a".repeat(101))).toBeNull();
    expect(cleanAgendaContent("a".repeat(500))).toHaveLength(500);
    expect(cleanAgendaContent("a".repeat(501))).toBeNull();
  });

  it("uses the constituent title and description as the debate topic", () => {
    expect(agendaPromptText(" Rents ", " Cap them. ")).toBe("Rents\nCap them.");
  });
});
