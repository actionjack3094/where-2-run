"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  loadCivicVerification,
  verifyAddress,
} from "@/app/actions/civic/verify-address";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";

type DeskStage = "booting" | "ready" | "error";

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function Tier2Verification() {
  const [stage, setStage] = useState<DeskStage>("booting");
  const [address, setAddress] = useState("");
  const [verified, setVerified] = useState(false);
  const [divisionCount, setDivisionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    await ensureArenaUser();
    const token = await accessToken();
    const result = await loadCivicVerification(token);
    setVerified(result.tier2Verified);
    setDivisionCount(result.ocdIdentifiers.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) {
          setError(null);
          setStage("ready");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load civic verification status.",
          );
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureArenaUser();
      const token = await accessToken();
      const result = await verifyAddress(address, token);
      setVerified(result.tier2Verified);
      setDivisionCount(result.ocdIdentifiers.length);
      setAddress("");
      setStage("ready");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not verify that address.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="tier-2-heading"
      className="mb-8 rounded-xl border border-gold/40 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Civic fencing
          </p>
          <h3
            id="tier-2-heading"
            className="mt-2 font-display text-lg font-semibold tracking-tight text-parchment"
          >
            Local constituent map
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Confirm a street address against the Civic Information API. Matching OCD
            division IDs unlock local-only debates for this campaign.
          </p>
        </div>
        {verified ? (
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-gold bg-gold/15 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-gold">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5 fill-gold/15 stroke-[2.25]" />
            Tier 2 Local Constituent Active
          </span>
        ) : null}
      </div>

      {stage === "booting" ? (
        <p className="mt-5 text-sm text-zinc-400">Checking civic standing…</p>
      ) : null}

      {stage === "error" && !verified ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm leading-6 text-red-300">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStage("booting");
              setError(null);
              void refresh().then(
                () => setStage("ready"),
                (caught: unknown) => {
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Could not load civic verification status.",
                  );
                  setStage("error");
                },
              );
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {stage === "ready" || verified ? (
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <label
            htmlFor="tier-2-address"
            className="text-[11px] font-medium uppercase tracking-widest text-zinc-400"
          >
            Street address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              id="tier-2-address"
              type="text"
              name="address"
              autoComplete="street-address"
              placeholder="1100 Congress Ave, Austin, TX 78701"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={200}
              className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
            />
            <Button
              type="submit"
              variant="gold"
              className="h-12 shrink-0 px-5"
              disabled={busy || address.trim().length < 5}
            >
              {busy ? "Mapping divisions…" : verified ? "Update address" : "Verify address"}
            </Button>
          </div>
          {verified && divisionCount > 0 ? (
            <p className="text-xs leading-5 text-zinc-500">
              {divisionCount} civic {divisionCount === 1 ? "division" : "divisions"} on file.
            </p>
          ) : null}
          {error && stage === "ready" ? (
            <p className="text-sm leading-6 text-red-300">{error}</p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
