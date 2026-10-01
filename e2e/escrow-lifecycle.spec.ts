import { expect, test } from "@playwright/test";
import { completeTier1Onboarding, signUp, uniqueTestUser } from "./helpers";

test("constituent onboards, sees their district matches, and opens a campaign vault", async ({
  page,
}) => {
  await signUp(page, uniqueTestUser());
  await completeTier1Onboarding(page);

  await expect(page).toHaveURL(/\/matchmaker/);
  await expect(page.getByRole("heading", { name: "YOUR MATCHES" })).toBeVisible();
  await expect(page.getByText(/Alignment Score|ELO/).first()).toBeVisible();

  await page.goto("/profile");
  await page.getByRole("tab", { name: "Campaign Hub" }).click();
  await expect(page.getByRole("heading", { name: "Run for Office" })).toBeVisible();
  await page.getByRole("button", { name: "Choose a race" }).click();

  const dialog = page.getByRole("dialog", { name: "Pick your race" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Local race" })).toBeVisible();
  await dialog.getByRole("button", { name: "Declare candidacy" }).click();

  const vault = page.getByRole("region", { name: /Campaign vault for/i });
  await expect(vault).toBeVisible();
  await expect(vault.getByText("Available balance")).toBeVisible();
  await expect(vault.getByText("$0.00").first()).toBeVisible();
  await expect(page.getByText(/0\s*\/\s*10/)).toBeVisible();
});
