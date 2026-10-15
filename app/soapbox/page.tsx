import type { Metadata } from "next";
import { SoapboxPage } from "@/app/soapbox/soapbox-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Soapbox · WHERE 2 RUN",
  description: "The matched-sphere locker room, with a switch to every primary.",
};

export default function Page() {
  return <SoapboxPage />;
}
