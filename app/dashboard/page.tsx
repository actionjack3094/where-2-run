import type { Metadata } from "next";
import { SignedInHq } from "@/app/dashboard/signed-in-hq";
import { CandidateFunnel } from "@/components/campaign/candidate-funnel";
import { getServerUser } from "@/lib/db/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Candidate HQ · WHERE 2 RUN",
  description: "Debater queue, Soapbox analytics, and the volunteer roster.",
};

export default async function CandidateHqPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getServerUser().catch(() => null);
  if (!user) return <CandidateFunnel />;
  return <SignedInHq userId={user.id} searchParams={props.searchParams} />;
}
