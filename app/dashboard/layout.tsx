import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate HQ · WHERE 2 RUN",
  description: "Identity, campaign platform, and ground game in one place.",
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return children;
}
