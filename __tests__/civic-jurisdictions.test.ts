import { describe, expect, it } from "vitest";
import { jurisdictionLabels } from "@/lib/civic-fencing";

const AUSTIN = [
  "ocd-division/country:us",
  "ocd-division/country:us/state:tx",
  "ocd-division/country:us/state:tx/cd:37",
  "ocd-division/country:us/state:tx/sldu:14",
  "ocd-division/country:us/state:tx/sldl:49",
  "ocd-division/country:us/state:tx/place:austin",
  "ocd-division/country:us/state:tx/place:austin/council_district:9",
];

describe("jurisdictionLabels", () => {
  it("truncates an Austin address to House, state senate, and city council", () => {
    expect(jurisdictionLabels(AUSTIN)).toEqual([
      "US House",
      "Texas State Senate",
      "Austin City Council",
    ]);
  });
});
