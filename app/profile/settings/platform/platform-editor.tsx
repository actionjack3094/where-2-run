"use client";

import { useState } from "react";
import { upsertCampaignPlatform, type CampaignRace } from "@/lib/actions/campaign";
import { tierLabel } from "@/lib/platform/types";
import { Button } from "@/components/ui/button";

export function PlatformEditor({ races }: { races: CampaignRace[] }) {
  const [primaryId, setPrimaryId] = useState(races[0]?.primaryId ?? "");
  const current = races.find((race) => race.primaryId === primaryId) ?? races[0];
  const [manifesto, setManifesto] = useState(current?.manifesto ?? "");
  const [policies, setPolicies] = useState<[string, string, string]>([
    current?.keyPolicies[0] ?? "",
    current?.keyPolicies[1] ?? "",
    current?.keyPolicies[2] ?? "",
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function choosePrimary(nextId: string) {
    const race = races.find((item) => item.primaryId === nextId);
    setPrimaryId(nextId);
    setManifesto(race?.manifesto ?? "");
    setPolicies([race?.keyPolicies[0] ?? "", race?.keyPolicies[1] ?? "", race?.keyPolicies[2] ?? ""]);
    setMessage(null);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !primaryId) return;
    setPending(true);
    setMessage(null);
    setError(null);
    const result = await upsertCampaignPlatform(primaryId, manifesto, policies);
    setMessage(result.message ?? null);
    setError(result.error ?? null);
    setPending(false);
  }

  if (!current) return null;

  return (
    <form className="mt-8 grid gap-4" onSubmit={(event) => void submit(event)}>
      {races.length > 1 ? (
        <label className="grid gap-2 text-sm text-zinc-300">
          Primary
          <select
            value={primaryId}
            onChange={(event) => choosePrimary(event.target.value)}
            className="h-12 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-parchment"
          >
            {races.map((race) => (
              <option key={race.primaryId} value={race.primaryId}>
                {race.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-zinc-300">
          {current.label} · {tierLabel(current.tier)}
        </p>
      )}
      <label className="grid gap-2 text-sm text-zinc-300">
        Manifesto
        <textarea
          required
          minLength={20}
          maxLength={4000}
          rows={8}
          value={manifesto}
          onChange={(event) => setManifesto(event.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-parchment"
        />
      </label>
      {policies.map((policy, index) => (
        <label key={index} className="grid gap-2 text-sm text-zinc-300">
          Policy pillar {index + 1}
          <input
            maxLength={180}
            value={policy}
            onChange={(event) => {
              const next = [...policies] as [string, string, string];
              next[index] = event.target.value;
              setPolicies(next);
            }}
            className="h-12 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-parchment"
          />
        </label>
      ))}
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "Publishing…" : "Publish platform"}
      </Button>
      {message ? <p className="text-sm leading-6 text-parchment">{message}</p> : null}
      {error ? <p className="text-sm leading-6 text-zinc-300">{error}</p> : null}
    </form>
  );
}
