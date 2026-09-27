import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set your ideological stances · WHERE 2 RUN",
  description:
    "Six questions that write the same six-axis stance vector for voters and candidates.",
};

export default function StanceLayout({ children }: LayoutProps<"/onboarding/stance">) {
  return children;
}
