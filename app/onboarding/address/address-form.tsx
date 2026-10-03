"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveVoterAddress } from "@/lib/actions/address";
import type { VoterDistrictFields } from "@/lib/civic/voter-districts";
import { Button } from "@/components/ui/button";

function DistrictLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="text-sm text-parchment">{value ?? "Not detected"}</p>
    </div>
  );
}

export function AddressForm({ initial }: { initial: VoterDistrictFields | null }) {
  const [address, setAddress] = useState("");
  const [districts, setDistricts] = useState<VoterDistrictFields | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await resolveVoterAddress(address);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setDistricts(result.districts);
    setPending(false);
  }

  return (
    <div className="mt-8">
      <form className="grid gap-4" onSubmit={(event) => void submit(event)} autoComplete="on">
        <label className="grid gap-2 text-sm text-zinc-300">
          Residential address
          <input
            name="address"
            required
            minLength={8}
            maxLength={200}
            autoComplete="street-address"
            placeholder="4600 Mueller Blvd, Austin, TX 78723"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="h-12 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
          />
        </label>
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? "Finding districts…" : "Find my districts"}
        </Button>
        {error ? <p className="text-sm leading-6 text-zinc-300">{error}</p> : null}
      </form>

      {districts ? (
        <section className="mt-8 rounded-xl border border-gold/50 bg-zinc-900 px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">
            Voting districts
          </p>
          <DistrictLine label="Congressional" value={districts.congressional} />
          <DistrictLine label="State House" value={districts.stateHouse} />
          <DistrictLine label="City Council" value={districts.cityCouncil} />
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            {districts.ocdIds.length} Open Civic Data divisions are on this ballot
            {districts.county ? `, including ${districts.county} County` : ""}.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link
              href="/onboarding/ideology"
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Continue to the diagnostic
            </Link>
            <Link
              href="/ballot"
              className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Open My Ballot
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
