import { expect, test } from "@playwright/test";

test("new voter signs up, maps a ZIP, calibrates a baseline vector, and reaches matchmaker", async ({
  page,
}) => {
  const email = `e2e.${Date.now()}@example.com`;
  const password = "Test-pass-123";

  await page.goto("/");
  await page.getByRole("link", { name: "Find Your Matches (Voters)" }).click();

  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();

  await page.waitForURL("**/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Map your district" })).toBeVisible();

  await page.getByLabel("ZIP code").fill("78704");
  await page.getByRole("button", { name: "Match my district" }).click();

  await expect(page.getByRole("heading", { name: "Baseline vector" })).toBeVisible();
  await expect(page.getByText(/U\.S\. House Texas District 37|37th Congressional/i)).toBeVisible();

  const firstPicks = [
    /Phase out fossil fuels/,
    /Move to a public single-payer/,
    /Expand legal immigration/,
  ];
  for (const pick of firstPicks) {
    await page.getByRole("button", { name: pick }).click();
  }

  await page.waitForURL("**/matchmaker");
  await expect(page.getByRole("heading", { name: "YOUR MATCHES" })).toBeVisible();
});
