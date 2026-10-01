import { expect, test } from "@playwright/test";
import {
  injectOverturnVerdicts,
  seedCompletedDebateWithAlignmentStreak,
} from "./db-helpers";
import { signIn } from "./helpers";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test("jury appeal quorum rolls back the winner's alignment streak and locks escrow", async ({
  page,
}) => {
  const fixture = await seedCompletedDebateWithAlignmentStreak();

  await signIn(page, fixture.constituent);
  await page.goto(`/debates/${fixture.debateId}`);
  await expect(page.getByText("Candidate A is the winner")).toBeVisible();

  await page.getByRole("button", { name: "Appeal Decision" }).click();
  const dialog = page.getByRole("dialog", { name: "Appeal this decision" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByPlaceholder("Explain why this outcome should be reviewed…")
    .fill("The weighted tally does not match the district record.");
  await dialog.getByRole("button", { name: "File appeal" }).click();

  await expect(page).toHaveURL(new RegExp(`/spectator/jury/${UUID.source}`, "i"));
  await expect(page.getByText("Spectator jury")).toBeVisible();

  const appealId = page.url().match(UUID)?.[0];
  if (!appealId) throw new Error("The jury dashboard URL did not include an appeal id.");
  await injectOverturnVerdicts(appealId);

  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await signIn(page, fixture.candidateA);

  await page.goto("/profile");
  await page.getByRole("tab", { name: "Campaign Hub" }).click();
  await expect(page.getByRole("progressbar", { name: /alignment streak/i })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(page.getByText(/0\s*\/\s*10/)).toBeVisible();
  await expect(page.getByText("Locked in escrow")).toBeVisible();
  await expect(page.getByText("$25.00")).toBeVisible();

  await expect(page.getByRole("button", { name: /Inbox, \d+ unread/ })).toBeVisible();
  await page.getByRole("button", { name: /Inbox, \d+ unread/ }).click();
  await expect(
    page.getByText("A jury overturned your debate win. Elo and escrow have been rolled back."),
  ).toBeVisible();
});
