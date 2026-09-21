"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureArenaUser } from "@/lib/arena/identity";
import {
  districtLevel,
  formatElectability,
  formatMatchPct,
  normalizeZip,
  projectContestOutlook,
  rankMatches,
  toNumber,
  unwrapDistrict,
  zipMatches,
  type ElectabilityMatch,
} from "@/lib/electability";
import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { District, ElectabilityScore, UserProfile } from "@/types/database.types";

type FeedView = "district" | "campaigns";
type LevelId = "local" | "state" | "federal";
type LoadStage = "loading" | "ready" | "error";

const FEEDS: { id: FeedView; label: string; hint: string }[] = [
  {
    id: "district",
    label: "My District",
    hint: "Voter view. Races on your local, state, and federal ballots.",
  },
  {
    id: "campaigns",
    label: "My Campaigns",
    hint: "Candidate view. Every seat, ranked by electability.",
  },
];

const LEVELS: {
  id: LevelId;
  label: string;
  empty: Record<FeedView, { title: string; body: string }>;
}[] = [
  {
    id: "local",
    label: "Local",
    empty: {
      district: {
        title: "No local races matched",
        body: "City, county, and school-board elections in your ZIP will land here.",
      },
      campaigns: {
        title: "No local campaigns filed",
        body: "Local eligibility is off by default. Verify residency, then file a seat.",
      },
    },
  },
  {
    id: "state",
    label: "State",
    empty: {
      district: {
        title: "No state races matched",
        body: "Legislative and statewide contests tied to your residency will show here.",
      },
      campaigns: {
        title: "No state campaigns filed",
        body: "Once you target a state district, electability for that seat appears here.",
      },
    },
  },
  {
    id: "federal",
    label: "Federal",
    empty: {
      district: {
        title: "No federal races matched",
        body: "House, Senate, and presidential matchups on your ballot will collect here.",
      },
      campaigns: {
        title: "No federal campaigns filed",
        body: "Federal eligibility is on by default. File a district to open this column.",
      },
    },
  },
];

type ScoreRow = ElectabilityScore & {
  districts: District | District[] | null;
};

export default function TriageDashboardPage() {
  const [feed, setFeed] = useState<FeedView>("district");
  const [stage, setStage] = useState<LoadStage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ElectabilityMatch[]>([]);
  const [zip, setZip] = useState("");
  const [zipDraft, setZipDraft] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ideologyVector, setIdeologyVector] = useState<unknown>(null);

  const active = FEEDS.find((entry) => entry.id === feed) ?? FEEDS[0];

  async function loadDashboard(nextZip?: string) {
    setError(null);
    setStage("loading");

    try {
      const arenaUser = await ensureArenaUser();
      setUserId(arenaUser.id);

      const storedZip = normalizeZip(
        nextZip ??
          window.sessionStorage.getItem(STORAGE_KEYS.residencyZip) ??
          "",
      );

      const [{ data: profile }, { data: districtRows, error: districtError }] =
        await Promise.all([
          supabase
            .from("users")
            .select("*")
            .eq("id", arenaUser.id)
            .maybeSingle(),
          supabase.from("districts").select("*").order("name"),
        ]);

      if (districtError) {
        throw new Error(districtError.message);
      }

      const user = profile as UserProfile | null;
      const districts = (districtRows ?? []) as District[];
      const residencyZip = storedZip || normalizeZip(user?.residency_zip);
      const sessionVector = window.sessionStorage.getItem(STORAGE_KEYS.vector);
      const vector = user?.ideology_vector ?? sessionVector;

      setZip(residencyZip);
      setZipDraft(residencyZip);
      setIdeologyVector(vector);

      if (sessionVector && !user?.ideology_vector) {
        await supabase
          .from("users")
          .update({ ideology_vector: sessionVector })
          .eq("id", arenaUser.id);
      }

      if (residencyZip && residencyZip !== normalizeZip(user?.residency_zip)) {
        await persistResidency(arenaUser.id, residencyZip, districts);
      }

      for (const district of districts) {
        const { error: rpcError } = await supabase.rpc("calculate_electability", {
          p_user_id: arenaUser.id,
          p_district_id: district.id,
        });
        if (rpcError) {
          throw new Error(rpcError.message);
        }
      }

      const { data: scoreRows, error: scoreError } = await supabase
        .from("electability_scores")
        .select("*, districts(*)")
        .eq("user_id", arenaUser.id);

      if (scoreError) {
        throw new Error(scoreError.message);
      }

      const nextMatches: ElectabilityMatch[] = [];
      for (const row of (scoreRows ?? []) as ScoreRow[]) {
        const district = unwrapDistrict(row.districts);
        if (!district) continue;
        nextMatches.push({
          id: row.id,
          user_id: row.user_id,
          district_id: row.district_id,
          ideological_match_pct: row.ideological_match_pct,
          debate_win_rate: row.debate_win_rate,
          total_escrow_pledged: row.total_escrow_pledged,
          legal_eligibility_integer: row.legal_eligibility_integer,
          electability_multiplier: row.electability_multiplier,
          created_at: row.created_at,
          updated_at: row.updated_at,
          district,
        });
      }

      setMatches(nextMatches);
      setStage("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load electability.");
      setStage("error");
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const columns = useMemo(() => {
    const ranked = rankMatches(matches);
    const visible =
      feed === "district"
        ? ranked.filter((row) => zipMatches(zip, row.district.zip_code))
        : ranked;

    return {
      local: visible.filter((row) => districtLevel(row.district.level) === "local"),
      state: visible.filter((row) => districtLevel(row.district.level) === "state"),
      federal: visible.filter((row) => districtLevel(row.district.level) === "federal"),
    };
  }, [feed, matches, zip]);

  async function handleSaveZip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextZip = normalizeZip(zipDraft);
    if (nextZip.length !== 5) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }

    setZipBusy(true);
    setZipError(null);
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.residencyZip, nextZip);
      if (userId) {
        const districts = matches.map((row) => row.district);
        await persistResidency(userId, nextZip, districts);
      }
      await loadDashboard(nextZip);
    } catch (caught) {
      setZipError(caught instanceof Error ? caught.message : "Could not save ZIP.");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/feed"
            className="w-fit text-xs font-medium uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Where 2 Run
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">My Campaign</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            {active.hint}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <ZipForm
            value={zipDraft}
            saved={zip}
            busy={zipBusy}
            error={zipError}
            onChange={setZipDraft}
            onSubmit={handleSaveZip}
          />
          <FeedToggle value={feed} onChange={setFeed} />
        </div>
      </div>

      {stage === "loading" && (
        <p className="mt-16 text-sm text-zinc-500">Scoring seats against your vector…</p>
      )}

      {stage === "error" && (
        <section className="mt-16 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {error ?? "Could not load electability scores."}
          </p>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="text-[11px] font-medium uppercase tracking-widest text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Try again
          </button>
        </section>
      )}

      {stage === "ready" && (
        <section className="mt-10 grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          {LEVELS.map((level) => {
            const rows = columns[level.id];
            const empty = level.empty[feed];
            const emptyTitle =
              feed === "district" && !zip
                ? "Add your ZIP"
                : empty.title;
            const emptyBody =
              feed === "district" && !zip
                ? "Save a geographic ZIP to restrict this ballot to your district."
                : empty.body;

            return (
              <Card
                key={level.id}
                className="flex min-h-[22rem] max-h-[70vh] flex-col overflow-hidden dark:bg-zinc-950"
              >
                <CardHeader className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                      {level.label}
                    </p>
                    <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      {feed === "district" ? "Ballot" : "Filing"}
                    </span>
                  </div>
                  <CardTitle className="text-lg">Matched elections</CardTitle>
                  <CardDescription>
                    {feed === "district"
                      ? zip
                        ? `ZIP ${zip} · ${rows.length} ${rows.length === 1 ? "race" : "races"}`
                        : `Voter feed · ${level.label.toLowerCase()} district`
                      : `Ranked by electability · ${rows.length} ${rows.length === 1 ? "seat" : "seats"}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col overflow-y-auto pt-4">
                  {rows.length === 0 ? (
                    <div className="flex flex-1 flex-col items-start justify-center py-8">
                      <p className="text-sm font-medium tracking-tight text-zinc-950 dark:text-zinc-50">
                        {emptyTitle}
                      </p>
                      <p className="mt-2 max-w-[16rem] text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                        {emptyBody}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 pb-2">
                      {rows.map((row) => (
                        <MatchCard
                          key={row.id}
                          match={row}
                          ideologyVector={ideologyVector}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </main>
  );
}

function MatchCard({
  match,
  ideologyVector,
}: {
  match: ElectabilityMatch;
  ideologyVector: unknown;
}) {
  const eligible = toNumber(match.legal_eligibility_integer) === 1;
  const outlook = projectContestOutlook({
    pviScore: match.district.pvi_score,
    matchPercent: match.ideological_match_pct,
    ideologyVector,
  });

  return (
    <Link href={`/district/${match.district.id}`} className="block">
      <div className="rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-500">
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
          {match.district.historical_lean ?? "Lean unpublished"}
        </p>
        <p className="mt-1 text-sm font-semibold leading-snug tracking-tight">
          {match.district.name}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
              Ideology Match
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {formatMatchPct(match.ideological_match_pct)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
              Electability
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
                !eligible && "text-zinc-400",
              )}
            >
              {formatElectability(match.electability_multiplier)}
            </p>
            {!eligible ? (
              <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-400">
                Ineligible
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
              outlook.favored === "Primary"
                ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "border border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
            )}
          >
            Primary {outlook.primaryPct}%
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
              outlook.favored === "General"
                ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "border border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400",
            )}
          >
            General {outlook.generalPct}%
          </span>
        </div>
      </div>
    </Link>
  );
}

function ZipForm({
  value,
  saved,
  busy,
  error,
  onChange,
  onSubmit,
}: {
  value: string;
  saved: string;
  busy: boolean;
  error: string | null;
  onChange: (next: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
      <label
        htmlFor="residency-zip"
        className="text-[11px] font-medium uppercase tracking-widest text-zinc-400"
      >
        Ballot ZIP{saved ? ` · ${saved}` : ""}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="residency-zip"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          placeholder="78701"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-28 rounded-full border border-zinc-200 bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-full border border-zinc-200 px-3 text-[11px] font-medium uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-950 disabled:opacity-50 dark:border-zinc-800 dark:hover:text-zinc-50"
        >
          {busy ? "Saving" : "Save"}
        </button>
      </div>
      {error ? (
        <p className="max-w-[16rem] text-xs text-zinc-600 dark:text-zinc-300">{error}</p>
      ) : null}
    </form>
  );
}

function FeedToggle({
  value,
  onChange,
}: {
  value: FeedView;
  onChange: (next: FeedView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard feed"
      className="inline-flex w-fit rounded-full border border-zinc-200 p-1 dark:border-zinc-800"
    >
      {FEEDS.map((entry) => {
        const selected = value === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(entry.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[11px] font-medium uppercase tracking-widest transition-colors",
              selected
                ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
            )}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

async function persistResidency(
  userId: string,
  zip: string,
  districts: Pick<District, "zip_code" | "state" | "level">[],
) {
  const localEligible = districts.some(
    (district) =>
      districtLevel(district.level) === "local" && zipMatches(zip, district.zip_code),
  );
  const matched = districts.find((district) => zipMatches(zip, district.zip_code));

  const { error } = await supabase
    .from("users")
    .update({
      residency_zip: zip,
      residency_state: matched?.state ?? null,
      is_eligible_local: localEligible,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
