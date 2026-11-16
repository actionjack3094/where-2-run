import { loadCampaignRaces, loadVolunteerRoster, type VolunteerSignupRow } from "@/lib/actions/campaign";
import { loadDebaterQueue, loadSoapboxAnalytics } from "@/lib/campaign/hq";
import { isMissingSchema } from "@/lib/db/schema-errors";

export type HqTab = "queue" | "soapbox" | "volunteers" | "identity" | "platform";

export function asHqTab(value: string | undefined): HqTab {
  if (value === "identity" || value === "platform") return value;
  if (value === "soapbox") return "soapbox";
  if (value === "volunteers" || value === "ground") return "volunteers";
  return "queue";
}

export async function loadFloor(tab: HqTab, userId: string) {
  let queue: Awaited<ReturnType<typeof loadDebaterQueue>> = [];
  let queueError: string | null = null;
  let soapbox: Awaited<ReturnType<typeof loadSoapboxAnalytics>> | null = null;
  let soapboxError: string | null = null;
  let groundError: string | null = null;
  let volunteers: VolunteerSignupRow[] = [];
  if (tab === "queue") {
    try {
      queue = await loadDebaterQueue(userId);
    } catch (caught) {
      queueError = caught instanceof Error ? caught.message : "Could not load the debater queue.";
    }
  }
  if (tab === "soapbox") {
    try {
      soapbox = await loadSoapboxAnalytics(userId);
    } catch (caught) {
      soapboxError = caught instanceof Error ? caught.message : "Could not load Soapbox analytics.";
    }
  }
  if (tab === "volunteers") {
    try {
      volunteers = (await loadVolunteerRoster(userId)).filter((row) => row.status !== "declined");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load volunteers.";
      groundError = isMissingSchema({ message }) ? "Apply the volunteer manager migration, then reload." : message;
    }
  }
  return { queue, queueError, soapbox, soapboxError, volunteers, groundError };
}

export async function loadAccount(tab: HqTab, userId: string) {
  let races: Awaited<ReturnType<typeof loadCampaignRaces>> = [];
  let platformError: string | null = null;
  if (tab === "platform") {
    try {
      races = await loadCampaignRaces(userId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load your primaries.";
      platformError = isMissingSchema({ message }) ? "Apply the campaign platform migration, then reload." : message;
    }
  }
  return { races, platformError };
}
