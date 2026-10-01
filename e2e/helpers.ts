import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "Test-pass-123";

export type TestUser = {
  email: string;
  password: string;
};

/** A unique inbox so each run signs up a fresh constituent. */
export function uniqueTestUser(now = Date.now()): TestUser {
  return {
    email: `testuser+${now}@example.com`,
    password: TEST_PASSWORD,
  };
}

/**
 * Sign in with an existing account and wait until the app leaves `/auth/login`.
 */
export async function signIn(page: Page, user: TestUser) {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: "Sign In" }).click();

  try {
    await expect(page).toHaveURL(/\/(?:feed|onboarding|matchmaker)(?:\?|$)/);
  } catch (error) {
    const message = (await page.getByRole("alert").textContent())?.trim();
    if (message) throw new Error(message);
    throw error;
  }
}

/**
 * Create an account through the login screen and wait until the app
 * sends a new constituent into `/onboarding`.
 */
export async function signUp(page: Page, user: TestUser = uniqueTestUser()) {
  await page.goto("/auth/login?mode=create");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.locator("form").getByRole("button", { name: "Create Account" }).click();

  try {
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
  } catch (error) {
    const message = (await page.getByRole("alert").textContent())?.trim();
    if (message) throw new Error(message);
    throw error;
  }
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  return user;
}

const CALIBRATION_PICKS = [
  /Phase out fossil fuels/,
  /Move to a public single-payer/,
  /Expand legal immigration/,
] as const;

/** ZIP 78704 maps to Texas's 37th, then the three baseline questions. */
export async function completeTier1Onboarding(page: Page, zip = "78704") {
  await expect(page.getByRole("heading", { name: "Map your district" })).toBeVisible();
  await page.getByLabel("ZIP code").fill(zip);
  await page.getByRole("button", { name: "Match my district" }).click();

  await expect(page.getByRole("heading", { name: "Baseline vector" })).toBeVisible();
  await expect(page.getByText("U.S. House Texas District 37")).toBeVisible();

  for (const pick of CALIBRATION_PICKS) {
    await page.getByRole("button", { name: pick }).click();
  }

  await page.waitForURL(/\/matchmaker(?:\?|$)/);
}
