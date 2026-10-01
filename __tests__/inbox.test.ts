import { describe, expect, it } from "vitest";
import {
  campaignRaceLabel,
  notificationHref,
  pledgeReceivedMessage,
} from "@/lib/notifications/inbox-shared";

describe("inbox copy", () => {
  it("shortens a House race for the pledge alert", () => {
    expect(
      campaignRaceLabel({
        officeName: "U.S. House Texas District 37",
        ocdId: "ocd-division/country:us/state:tx/cd:37",
      }),
    ).toBe("TX-37");
    expect(pledgeReceivedMessage(25, "TX-37")).toBe(
      "Someone pledged $25 to your TX-37 campaign!",
    );
  });

  it("routes each alert type to the underlying record", () => {
    expect(notificationHref("pledge_received", "abc")).toBe("/profile");
    expect(notificationHref("appeal_filed", "appeal-1")).toBe("/spectator/jury/appeal-1");
    expect(notificationHref("verdict_overturned", "appeal-1")).toBe(
      "/spectator/jury/appeal-1",
    );
    expect(notificationHref("coalition_invite", "coal-1")).toBe("/my-campaign/coalitions");
    expect(notificationHref("challenge_received", "debate-1")).toBe("/debates/debate-1");
  });
});
