import { compactCongressionalLabel } from "@/lib/campaign/targets";
import type { UserNotification, UserNotificationType } from "@/types/database.types";

export const INBOX_LIMIT = 50;
export const INBOX_PREVIEW = 8;
export const INBOX_UPDATED_EVENT = "where2run:inbox-updated";

export function notifyInboxUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INBOX_UPDATED_EVENT));
}

export type InboxItem = {
  id: string;
  type: UserNotificationType | string;
  referenceId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
  href: string;
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function campaignRaceLabel(input: {
  officeName?: string | null;
  ocdId?: string | null;
}) {
  const compact = compactCongressionalLabel(input.ocdId);
  if (compact) return compact.replace(/^U\.S\. House\s+/, "");
  const office = input.officeName?.trim();
  return office || null;
}

export function pledgeReceivedMessage(amount: number, raceLabel: string | null) {
  const dollars = formatUsd(amount);
  return raceLabel
    ? `Someone pledged ${dollars} to your ${raceLabel} campaign!`
    : `Someone pledged ${dollars} to your campaign!`;
}

export function payoutDisbursedMessage(amount: number, raceLabel: string | null) {
  const dollars = formatUsd(amount);
  return raceLabel
    ? `${dollars} was transferred to your bank for the ${raceLabel} campaign.`
    : `${dollars} was transferred to your bank.`;
}

export function pledgeFundedMessage(amount: number, raceLabel: string | null) {
  const dollars = formatUsd(amount);
  return raceLabel
    ? `A supporter officially funded a ${dollars} pledge to your ${raceLabel} campaign.`
    : `A supporter officially funded a ${dollars} pledge to your campaign.`;
}

export function notificationHref(
  type: string,
  referenceId: string | null | undefined,
) {
  const id = referenceId?.trim() || null;
  switch (type) {
    case "pledge_received":
    case "payout_disbursed":
    case "pledge_funded":
      return "/profile";
    case "coalition_invite":
      return "/my-campaign/coalitions";
    case "challenge_received":
      return id ? `/debates/${id}` : "/feed";
    default:
      return "/inbox";
  }
}

export function toInboxItem(row: UserNotification): InboxItem {
  return {
    id: row.id,
    type: row.type,
    referenceId: row.reference_id,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
    href: notificationHref(row.type, row.reference_id),
  };
}
