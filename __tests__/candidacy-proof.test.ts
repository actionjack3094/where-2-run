import { describe, expect, it } from "vitest";
import {
  candidacyDocumentPath,
  committeeNameError,
  donationUrlError,
  normalizeEscrowStatus,
  officialCandidateIdError,
  officialDonationHref,
  pdfHeaderError,
} from "@/lib/escrow/candidacy";

const USER_ID = "a07e0001-0001-4000-8000-000000000001";
const TARGET_ID = "b07e0001-0001-4000-8000-000000000001";
const FILE_ID = "c07e0001-0001-4000-8000-000000000001";
const PATH = `${USER_ID}/${TARGET_ID}/${FILE_ID}.pdf`;

describe("officialCandidateIdError", () => {
  it("accepts an FEC candidate ID", () => {
    expect(officialCandidateIdError("H2TX10025")).toBeNull();
  });

  it("rejects a Social Security number", () => {
    expect(officialCandidateIdError("123-45-6789")).toMatch(/Social Security/);
    expect(officialCandidateIdError("123456789")).toMatch(/Social Security/);
  });
});

describe("officialDonationHref", () => {
  it("keeps ActBlue and WinRed https pages", () => {
    expect(officialDonationHref("https://secure.actblue.com/donate/jane-for-congress")).toBe(
      "https://secure.actblue.com/donate/jane-for-congress",
    );
    expect(officialDonationHref("https://secure.winred.com/jane/donate")).toBe(
      "https://secure.winred.com/jane/donate",
    );
  });

  it("drops other hosts and unsafe URLs", () => {
    expect(officialDonationHref("https://evil.example/actblue.com")).toBeNull();
    expect(officialDonationHref("javascript:alert(1)")).toBeNull();
    expect(donationUrlError("https://example.com/donate")).toMatch(/ActBlue or WinRed/);
  });
});

describe("committeeNameError", () => {
  it("accepts a committee name and rejects a blank one", () => {
    expect(committeeNameError("Jane Doe for Congress")).toBeNull();
    expect(committeeNameError(" ")).toMatch(/committee name/);
  });
});

describe("candidacyDocumentPath", () => {
  it("accepts a storage path and a matching Supabase URL owned by the filer", () => {
    expect(candidacyDocumentPath(PATH, USER_ID, TARGET_ID)).toBe(PATH);
    expect(
      candidacyDocumentPath(
        `https://example.supabase.co/storage/v1/object/public/candidacy-proofs/${PATH}`,
        USER_ID,
        TARGET_ID,
      ),
    ).toBe(PATH);
    expect(
      candidacyDocumentPath(
        `http://127.0.0.1:54421/storage/v1/object/public/candidacy-proofs/${PATH}`,
        USER_ID,
        TARGET_ID,
      ),
    ).toBe(PATH);
  });

  it("rejects another user's object and path traversal", () => {
    expect(candidacyDocumentPath(PATH, "a07e0001-0002-4000-8000-000000000002", TARGET_ID)).toBeNull();
    expect(candidacyDocumentPath(`${USER_ID}/../${TARGET_ID}/${FILE_ID}.pdf`, USER_ID, TARGET_ID)).toBeNull();
  });
});

describe("pdfHeaderError", () => {
  it("requires a PDF header", () => {
    expect(pdfHeaderError(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(pdfHeaderError(new TextEncoder().encode("<html"))).toMatch(/PDF/);
  });
});

describe("normalizeEscrowStatus", () => {
  it("falls back to accumulating", () => {
    expect(normalizeEscrowStatus("released")).toBe("released");
    expect(normalizeEscrowStatus("nope")).toBe("accumulating");
  });
});
