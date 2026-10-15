import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding · WHERE 2 RUN",
  description:
    "Eight questions, a result card, then the ZIP code that opens your ballot.",
};

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return children;
}
