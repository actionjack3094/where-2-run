"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitTier3Claim } from "@/app/actions/verification/claim-profile";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/db/supabase";

type SeededProfile = {
  id: string;
  displayName: string;
  office: string | null;
};

export function ClaimForm({ profiles }: { profiles: SeededProfile[] }) {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState(profiles[0]?.id ?? "");
  const [governmentIdReference, setGovernmentIdReference] = useState("");
  const [ballotName, setBallotName] = useState("");
  const [ballotOcdId, setBallotOcdId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit() {
    setPending(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      await submitTier3Claim(
        { candidateId, governmentIdReference, ballotName, ballotOcdId },
        data.session?.access_token ?? null,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not file that claim.");
    } finally {
      setPending(false);
    }
  }

  if (profiles.length === 0) {
    return (
      <p className="mt-8 text-sm leading-6 text-zinc-400">
        No unclaimed seeded profiles are on the ledger yet.
      </p>
    );
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <label className="block text-sm text-zinc-300">
        Seeded profile
        <select
          value={candidateId}
          onChange={(event) => setCandidateId(event.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
              {profile.office ? ` · ${profile.office}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-zinc-300">
        Government ID reference
        <input
          value={governmentIdReference}
          onChange={(event) => setGovernmentIdReference(event.target.value)}
          placeholder="Review case or last-four token"
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        />
      </label>
      <label className="block text-sm text-zinc-300">
        Name on the local ballot
        <input
          value={ballotName}
          onChange={(event) => setBallotName(event.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        />
      </label>
      <label className="block text-sm text-zinc-300">
        Ballot OCD-ID
        <input
          value={ballotOcdId}
          onChange={(event) => setBallotOcdId(event.target.value)}
          placeholder="ocd-division/country:us/state:tx/cd:37"
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-parchment"
        />
      </label>
      {error ? <p className="text-sm leading-6 text-red-300">{error}</p> : null}
        <Button type="button" variant="gold" disabled={pending} onClick={() => void onSubmit()}>
        {pending ? "Filing claim…" : "Submit claim"}
      </Button>
    </form>
  );
}
