import type { Metadata } from "next";
import { SoapboxBoard } from "@/components/soapbox/SoapboxBoard";
import { loadSoapboxViewer } from "@/lib/soapbox/viewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Soapbox · WHERE 2 RUN",
  description: "Campaign dispatches for matched primaries, and the local floor in your home district.",
};

export default async function Page() {
  const viewer = await loadSoapboxViewer();

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-stone-50 text-stone-900">
      <SoapboxBoard viewer={viewer} />
    </main>
  );
}
