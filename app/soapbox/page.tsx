import type { Metadata } from "next";
import { SoapboxPage } from "@/app/soapbox/soapbox-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Soapbox · WHERE 2 RUN",
  description: "A single-column feed of stump speeches, trending nationwide and local to your ZIP.",
};

export default function Page() {
  return <SoapboxPage />;
}
