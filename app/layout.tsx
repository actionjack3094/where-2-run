import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import { PledgeHost } from "@/components/pledges/PledgeHost";
import { SiteChrome } from "@/components/site-chrome";
import { loadNavIdentity } from "@/lib/actions/profile";
import { redirectIfOnboardingIncomplete } from "@/lib/onboarding/gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WHERE 2 RUN",
  description: "Find the district that matches your ideology, then enter the race.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await redirectIfOnboardingIncomplete();
  const identity = await loadNavIdentity().catch(() => null);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-stone-50 text-charcoal">
        <PledgeHost>
          <SiteChrome identity={identity}>{children}</SiteChrome>
        </PledgeHost>
      </body>
    </html>
  );
}
