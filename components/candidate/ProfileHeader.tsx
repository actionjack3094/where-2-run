"use client";

import { MapPin, ShieldCheck } from "lucide-react";
import { PledgeEscrowButton } from "@/components/pledges/PledgeEscrowButton";
import { CandidateAvatar } from "@/components/profile/CandidateAvatar";
import { VerificationBadge } from "@/components/verification/VerificationBadge";

export function ProfileHeader({
  candidateId,
  name,
  verificationTier,
  districtLabel,
  districtVerified,
  eloRating,
  eloLocked,
  lockedMatchCount,
  electionId,
}: {
  candidateId: string;
  name: string;
  verificationTier: string;
  districtLabel: string | null;
  districtVerified: boolean;
  eloRating: number;
  eloLocked: boolean;
  lockedMatchCount: number;
  electionId?: string | null;
}) {
  return (
    <header className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-5">
        <CandidateAvatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Public candidate
          </p>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-parchment sm:text-4xl">
            <span className="min-w-0 truncate">{name}</span>
            <VerificationBadge tier={verificationTier} size="lg" />
          </h1>
          <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-zinc-400">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              {districtLabel ? (
                <>
                  <span className="font-medium text-parchment">{districtLabel}</span>
                  {districtVerified ? (
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-gold">
                      <ShieldCheck
                        aria-hidden
                        className="h-3.5 w-3.5 fill-gold/15 stroke-[2.25]"
                      />
                      Verified OCD district
                    </span>
                  ) : (
                    <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                      Geographic district on file
                    </span>
                  )}
                </>
              ) : (
                <span>No verified OCD district on file yet.</span>
              )}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div
          className="flex h-32 min-w-32 shrink-0 flex-col items-center justify-center rounded-full border-2 border-gold bg-gold/15 px-5 text-center shadow-[0_0_32px_rgba(212,175,55,0.18)]"
          aria-label={`${eloLocked ? "Locked ELO" : "ELO"} ${eloRating}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-gold">
            {eloLocked ? "Locked ELO" : "ELO"}
          </p>
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums leading-none tracking-tight text-gold">
            {eloRating}
          </p>
          {eloLocked ? (
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-gold/80">
              {lockedMatchCount} sealed
            </p>
          ) : null}
        </div>
        <PledgeEscrowButton
          candidateId={candidateId}
          candidateName={name}
          electionId={electionId}
          className="sm:max-w-[16rem]"
        />
      </div>
    </header>
  );
}
