import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Campaign · WHERE 2 RUN",
  description:
    "Sort Local, State, and Federal matched elections as a voter or a candidate.",
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return children;
}
