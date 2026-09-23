"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  loadTier2Verification,
  verifyAddress,
} from "@/app/actions/verification/verify-address";
import { Button } from "@/components/ui/button";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";

type Fields = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

const EMPTY_FIELDS: Fields = { street: "", city: "", state: "", zip: "" };

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function composeAddress(fields: Fields) {
  const street = fields.street.trim().replace(/\s+/g, " ");
  const city = fields.city.trim().replace(/\s+/g, " ");
  const state = fields.state.trim().replace(/\s+/g, " ");
  const zip = fields.zip.trim().replace(/\s+/g, " ");
  const region = [state, zip].filter(Boolean).join(" ");
  return [street, city, region].filter(Boolean).join(", ");
}

export function Tier2Verification() {
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [verified, setVerified] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await ensureArenaUser();
    const token = await accessToken();
    const result = await loadTier2Verification(token);
    setVerified(result.verified);
    setJurisdictions(result.jurisdictions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setError(null);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load civic verification.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  function updateField(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || verified) return;
    setBusy(true);
    setError(null);
    try {
      await ensureArenaUser();
      const token = await accessToken();
      const result = await verifyAddress(composeAddress(fields), token);
      setVerified(result.verified);
      setJurisdictions(result.jurisdictions);
      setFields(EMPTY_FIELDS);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify that address.");
    } finally {
      setBusy(false);
    }
  }

  const address = composeAddress(fields);
  const canSubmit =
    fields.street.trim().length > 0 &&
    fields.city.trim().length > 0 &&
    fields.state.trim().length > 0 &&
    address.length >= 5;

  return (
    <section
      aria-labelledby="tier-2-constituent-heading"
      className="rounded-xl border border-gold/40 bg-zinc-900 p-5 shadow-[inset_3px_0_0_0_var(--gold-strong)]"
    >
      <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
        Civic verification
      </p>
      <h2
        id="tier-2-constituent-heading"
        className="mt-2 font-display text-lg font-semibold tracking-tight text-parchment"
      >
        Residential address
      </h2>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-400">Checking civic standing…</p>
      ) : verified ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold bg-gold/15 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-gold">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5 fill-gold/15 stroke-[2.25]" />
            Tier 2 Verified Constituent
          </span>
          {jurisdictions.length > 0 ? (
            <p className="text-sm leading-6 text-parchment">
              Verified: {jurisdictions.join(", ")}
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <p className="max-w-xl text-sm leading-6 text-zinc-400">
            Confirm where you live. A successful lookup matches this profile to the
            districts that can vote on local appeals.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
              Street address
            </span>
            <input
              type="text"
              name="street"
              autoComplete="address-line1"
              placeholder="1100 Congress Ave"
              value={fields.street}
              onChange={(event) => updateField("street", event.target.value)}
              maxLength={120}
              required
              className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                City
              </span>
              <input
                type="text"
                name="city"
                autoComplete="address-level2"
                placeholder="Austin"
                value={fields.city}
                onChange={(event) => updateField("city", event.target.value)}
                maxLength={60}
                required
                className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                State
              </span>
              <input
                type="text"
                name="state"
                autoComplete="address-level1"
                placeholder="TX"
                value={fields.state}
                onChange={(event) => updateField("state", event.target.value)}
                maxLength={32}
                required
                className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                ZIP
              </span>
              <input
                type="text"
                name="zip"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="78701"
                value={fields.zip}
                onChange={(event) => updateField("zip", event.target.value)}
                maxLength={10}
                className="h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60"
              />
            </label>
          </div>
          {error ? (
            <p className="text-sm leading-6 text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="gold"
            className="h-12 w-full sm:w-fit sm:px-5"
            disabled={busy || !canSubmit}
          >
            {busy ? "Mapping districts…" : "Verify address"}
          </Button>
        </form>
      )}
    </section>
  );
}
