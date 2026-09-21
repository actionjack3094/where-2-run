import type { Metadata } from "next";
import Link from "next/link";
import { DebateHistory } from "@/components/candidate/DebateHistory";
import { EscrowTracker } from "@/components/candidate/EscrowTracker";
import { ProfileHeader } from "@/components/candidate/ProfileHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadPublicCandidate } from "@/lib/candidate-profile";

type CandidatePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: CandidatePageProps): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await loadPublicCandidate(id);
  const name = profile?.username;

  return {
    title: name ? `${name} · Candidate · WHERE 2 RUN` : "Candidate · WHERE 2 RUN",
    description: name
      ? `Locked ELO, vaulted escrow, and arena debate history for ${name}.`
      : "Public candidate profile on WHERE 2 RUN.",
  };
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const { id } = await params;
  const { profile, error } = await loadPublicCandidate(id);

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10 pb-16">
        {error ? (
          <p className="mt-8 text-sm leading-6 text-zinc-400">
            Could not load this candidate. {error}
          </p>
        ) : !profile ? (
          <MissingCandidate />
        ) : (
          <div className="flex flex-col gap-14">
            <ProfileHeader
              candidateId={profile.id}
              name={profile.username}
              verificationTier={profile.verificationTier}
              districtLabel={profile.ocdDistrict ?? profile.targetDistrictName}
              districtVerified={profile.ocdVerified}
              eloRating={profile.eloRating}
              eloLocked={profile.eloLocked}
              lockedMatchCount={profile.lockedMatchCount}
              electionId={profile.targetDistrictId}
            />
            <EscrowTracker
              total={profile.escrowTotal}
              count={profile.escrowCount}
              candidateName={profile.username}
            />
            <DebateHistory matches={profile.matches} />
          </div>
        )}
      </div>
    </main>
  );
}

function MissingCandidate() {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Candidate not found</CardTitle>
        <CardDescription>
          This id is not on a ticket yet. Open a leaderboard and pick a name from the
          floor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/leaderboards"
          className="inline-flex h-10 items-center justify-center rounded-md border border-gold/60 bg-zinc-950 px-4 text-xs font-medium uppercase tracking-widest text-parchment transition-colors hover:border-gold hover:bg-zinc-900"
        >
          View leaderboards
        </Link>
      </CardContent>
    </Card>
  );
}
