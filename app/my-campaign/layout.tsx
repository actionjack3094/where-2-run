import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Campaign · WHERE 2 RUN",
  description:
    "Take a stance, file for ballot access, charter coalitions, and rank the seats you qualify to enter.",
};

export default function MyCampaignLayout({
  children,
}: LayoutProps<"/my-campaign">) {
  return children;
}
