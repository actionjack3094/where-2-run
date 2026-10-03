import { describe, expect, it } from "vitest";
import { verifiedLegalName } from "@/lib/stripe";

describe("stripe identity", () => {
  it("joins the verified first and last name for the legal name", () => {
    expect(verifiedLegalName("Ada", "Lovelace")).toBe("Ada Lovelace");
    expect(verifiedLegalName("  Ada ", " Lovelace ")).toBe("Ada Lovelace");
    expect(verifiedLegalName("Ada", "")).toBe("Ada");
    expect(verifiedLegalName(null, null)).toBe("");
  });
});
