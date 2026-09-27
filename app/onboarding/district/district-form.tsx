"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assignVoterDistrict } from "@/lib/actions/civic-onboarding";
import { cn } from "@/lib/utils";

export type DistrictOption = {
  id: string;
  name: string;
  level: string;
  state: string | null;
};

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");
}

export function DistrictForm({ districts }: { districts: DistrictOption[] }) {
  const [districtId, setDistrictId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verifyDistrict(selected: string) {
    if (busy) return;
    if (!selected) {
      setError("Select your district.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await assignVoterDistrict(selected);
    } catch (caught) {
      if (isNextRedirectError(caught)) throw caught;
      setError(caught instanceof Error ? caught.message : "Could not verify your district.");
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-10 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void verifyDistrict(districtId);
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Local district</legend>
        {districts.map((district) => {
          const selected = district.id === districtId;
          const detail = [district.level, district.state].filter(Boolean).join(" · ");
          return (
            <label
              key={district.id}
              className={cn(
                "flex cursor-pointer items-start gap-4 rounded-xl border bg-zinc-900 px-5 py-4 transition-colors",
                selected
                  ? "border-gold shadow-[inset_3px_0_0_0_var(--gold-strong)]"
                  : "border-gold/40 hover:border-gold",
              )}
            >
              <input
                type="radio"
                name="districtId"
                value={district.id}
                checked={selected}
                onChange={() => {
                  setDistrictId(district.id);
                  setError(null);
                }}
                className="mt-1 accent-gold"
              />
              <span className="min-w-0">
                <span className="block font-medium text-parchment">{district.name}</span>
                {detail ? (
                  <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    {detail}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      {error ? (
        <p className="text-sm leading-6 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="gold"
        size="full"
        disabled={busy || districts.length === 0}
        onClick={() => void verifyDistrict(districtId)}
      >
        {busy ? "Verifying district…" : "Verify district"}
      </Button>
    </form>
  );
}
