import { expect, test } from "@playwright/test";
import { completeTier1Onboarding, signUp, uniqueTestUser } from "./helpers";

test("new voter signs up, maps a ZIP, calibrates a baseline vector, and reaches matchmaker", async ({
  page,
}) => {
  await signUp(page, uniqueTestUser());
  await completeTier1Onboarding(page);
  await expect(page.getByRole("heading", { name: "YOUR MATCHES" })).toBeVisible();
});
