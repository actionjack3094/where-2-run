import { expect, test } from "@playwright/test";

const STANCE_VALUES = ["-0.6", "0.8", "0.4", "-0.2", "0.5", "0.7"] as const;

test("new voter signs up, files Austin District 9, and reaches matchmaker and the civic feed", async ({
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

  await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"));

  if (!page.url().includes("/onboarding/district")) {
    await page.getByRole("banner").getByRole("link", { name: "Matchmaker", exact: true }).click();
    await page.waitForURL("**/matchmaker");
    const verifyDistrict = page.getByRole("link", { name: /verify your local district/i });
    await expect(verifyDistrict).toBeVisible();
    await verifyDistrict.click();
  }

  await page.waitForURL("**/onboarding/district");
  await expect(page.getByRole("heading", { name: "Verify your local district" })).toBeVisible();

  await page.getByRole("radio", { name: /Austin City Council - District 9/ }).check();
  await page.getByRole("button", { name: "Verify district" }).click();

  await page.waitForURL("**/onboarding/stance");
  await expect(page.getByRole("heading", { name: "Set your ideological stances" })).toBeVisible();

  const sliders = page.getByRole("slider");
  await expect(sliders).toHaveCount(STANCE_VALUES.length);
  for (const [index, value] of STANCE_VALUES.entries()) {
    await sliders.nth(index).fill(value);
  }

  await page.getByRole("button", { name: "File stance vector" }).click();

  await page.waitForURL("**/matchmaker");
  await expect(page.getByRole("heading", { name: "YOUR MATCHES" })).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "Feed", exact: true }).click();
  await page.waitForURL("**/feed");
  await expect(page.getByText("Civic Feed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Endless Social Feed" })).toBeVisible();
  await expect(page.getByText("Viewing live activity for: Austin City Council - District 9")).toBeVisible();
});
