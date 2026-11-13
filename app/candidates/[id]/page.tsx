import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateProfile } from "@/app/candidates/[id]/candidate-profile";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { platformAdmin } from "@/lib/platform/records";
import type { AccountProfile } from "@/types/database.types";

export const dynamic = "force-dynamic";

type CandidatePageProps = { params: Promise<{ id: string }> };

const COLUMNS =
  "id, full_name, party, office, candidate_stage, ideology_x, ideology_y, voting_zip_code, district_votes, escrow_pledged, escrow_target";

async function loadCandidate(id: string) {
  const admin = platformAdmin();
  const full = await admin.from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
  if (!full.error) return (full.data as AccountProfile | null) ?? null;
  if (!isMissingSchema(full.error)) return null;
  const base = await admin
    .from("profiles")
    .select("id, full_name, ideology_x, ideology_y, voting_zip_code")
    .eq("id", id)
    .maybeSingle();
  return (base.data as AccountProfile | null) ?? null;
}

export async function generateMetadata({ params }: CandidatePageProps): Promise<Metadata> {
  const candidate = await loadCandidate((await params).id);
  const name = candidate?.full_name?.trim() || "Candidate";
  return {
    title: candidate ? `${name} · WHERE 2 RUN` : "Candidate · WHERE 2 RUN",
    description: candidate?.office?.trim() || "Public candidate profile on WHERE 2 RUN.",
  };
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const candidate = await loadCandidate((await params).id);
  if (!candidate) notFound();
  return <CandidateProfile candidate={candidate} />;
}
