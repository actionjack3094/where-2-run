"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";
import type { CivicStance, District } from "@/types/database.types";

export const DEFAULT_STANCE_DISTRICT = "Austin City Council - District 9";

const STANCES: CivicStance[] = ["Affirmative", "Negative"];

function sentenceCount(text: string) {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function TakeStanceModal() {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState("");
  const [stance, setStance] = useState<CivicStance>("Affirmative");
  const [argument, setArgument] = useState("");
  const [districtId, setDistrictId] = useState(DEFAULT_STANCE_DISTRICT);
  const [districts, setDistricts] = useState<string[]>([DEFAULT_STANCE_DISTRICT]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDistricts() {
      const { data } = await supabase.from("districts").select("name").order("name");
      if (cancelled || !data?.length) return;
      const names = Array.from(
        new Set(
          (data as Pick<District, "name">[])
            .map((row) => row.name)
            .filter((name): name is string => Boolean(name)),
        ),
      );
      if (!names.includes(DEFAULT_STANCE_DISTRICT)) {
        names.unshift(DEFAULT_STANCE_DISTRICT);
      }
      setDistricts(names);
    }

    void loadDistricts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  function resetForm() {
    setClaim("");
    setStance("Affirmative");
    setArgument("");
    setDistrictId(DEFAULT_STANCE_DISTRICT);
    setFormError(null);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    resetForm();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const nextClaim = claim.trim();
    const nextArgument = argument.trim();
    const nextDistrict = districtId.trim();

    if (!nextClaim || !nextArgument || !nextDistrict) {
      setFormError("Fill in the claim, argument, and district.");
      return;
    }
    if (sentenceCount(nextArgument) < 3) {
      setFormError("Give a supporting argument of 3 to 5 sentences.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await ensureArenaUser();
      const response = await fetch("/api/posts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: nextClaim,
          stance,
          argument: nextArgument,
          district_id: nextDistrict,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not publish the stance.");
      }

      setOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not publish the stance.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
      >
        Take a Stance
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-1.5 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Civic Feed
              </p>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                Take a Stance
              </h2>
              <p className="text-sm leading-6 text-zinc-400">
                File a proposition for your district. Matches are scored against nearby ideology.
              </p>
            </div>

            <form className="flex flex-col gap-4 px-5 pb-5" onSubmit={(event) => void handleSubmit(event)}>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  Proposition / Claim
                </span>
                <input
                  value={claim}
                  onChange={(event) => setClaim(event.target.value)}
                  required
                  autoFocus
                  placeholder="Austin should eliminate minimum parking mandates"
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
                />
              </label>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  Stance
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {STANCES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={stance === option}
                      onClick={() => setStance(option)}
                      className={cn(
                        "inline-flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                        stance === option
                          ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  Supporting Argument
                </span>
                <textarea
                  value={argument}
                  onChange={(event) => setArgument(event.target.value)}
                  required
                  rows={5}
                  placeholder="Write 3 to 5 sentences detailing the rationale."
                  className="resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  District
                </span>
                <select
                  value={districtId}
                  onChange={(event) => setDistrictId(event.target.value)}
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-zinc-400"
                >
                  {districts.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              {formError && <p className="text-sm text-red-300">{formError}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Publishing…" : "Publish stance"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
