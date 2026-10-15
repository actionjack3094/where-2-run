import type { Metadata } from "next";
import { MatchedPrimaries } from "@/app/elections/matched/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Matched Primaries · WHERE 2 RUN",
  description: "Races ranked by Euclidean alignment, with the top constituent question and a way onto the floor.",
};

export default function HomePage(props: {
  searchParams: Promise<{ scope?: string; level?: string; seats?: string }>;
}) {
  return <MatchedPrimaries {...props} />;
}
