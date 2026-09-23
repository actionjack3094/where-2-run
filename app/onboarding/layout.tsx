import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Onboarding · WHERE 2 RUN",
  description:
    "Verify a residential address, calibrate a six-axis ideology vector, and reveal the three most viable races.",
};

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return children;
}
