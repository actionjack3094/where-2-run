import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding · WHERE 2 RUN",
  description:
    "Map a residential ZIP to a congressional district and seed a baseline stance vector.",
};

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return children;
}
