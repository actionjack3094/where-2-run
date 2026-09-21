"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type LoadStage = "loading" | "ready" | "error";
type LevelId = "local" | "state" | "federal";

type ScoreRow = ElectabilityScore & {
  districts: District | District[] | null;
};

const LEVELS: {
  id: LevelId;
  label: string;
  empty: { title: string; body: string };
}[] = [
  {
    id: "local",
    label: "Local",
    empty: {
      title: "No local campaigns filed",
      body: "Local eligibility is off by default. Verify residency, then file a seat.",
    },
  },
  {
    id: "state",
    label: "State",
    empty: {
      title: "No state campaigns filed",
      body: "Once you target a state district, electability for that seat appears here.",
    },
  },
  {
    id: "federal",
    label: "Federal",
    empty: {
      title: "No federal campaigns filed",
      body: "Federal eligibility is on by default. File a district to open this column.",
    },
  },
];

export function MatchedElections() {
  const [stage, setStage] = useState<LoadStage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ElectabilityMatch[]>([]);
  const [ideologyVector, setIdeologyVector] = useState<unknown>(null);
  const [mapNotice, setMapNotice] = useState(false);

  async function loadMatches() {
    setError(null);
    setStage("loading");

    try {
      const arenaUser = await ensureArenaUser();
      const storedZip = normalizeZip(
        window.sessionStorage.getItem(STORAGE_KEYS.residencyZip) ?? "",
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
      setError(
        caught instanceof Error ? caught.message : "Could not load matched elections.",
      );
      setStage("error");
    }
  }

  useEffect(() => {
    void loadMatches();
  }, []);

  const columns = useMemo(() => {
    const ranked = rankMatches(matches);

    return {
      local: ranked.filter((row) => districtLevel(row.district.level) === "local"),
      state: ranked.filter((row) => districtLevel(row.district.level) === "state"),
      federal: ranked.filter(
        (row) => districtLevel(row.district.level) === "federal",
      ),
    };
  }, [matches]);

  return (
    <section aria-labelledby="matched-elections-heading" className="mt-16">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Filing Board
          </p>
          <h2
            id="matched-elections-heading"
            className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment"
          >
            Matched Elections
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Seats you rank high in, with legal qualification marked on every
            filing.
          </p>
        </header>

        <button
          type="button"
          onClick={() => setMapNotice(true)}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-gold-strong px-5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-950 transition-colors hover:bg-gold"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
            <path
              d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="10"
              r="2.25"
              stroke="currentColor"
              strokeWidth="1.7"
            />
          </svg>
          View Geographic Match Map
        </button>
      </div>

      {mapNotice ? (
        <p className="mt-3 text-sm text-gold">
          Spatial match map forthcoming. District geometry is not wired yet.
        </p>
      ) : null}

      {stage === "loading" && (
        <p className="mt-10 text-sm text-zinc-500">
          Scoring seats against your vector…
        </p>
      )}

      {stage === "error" && (
        <div className="mt-10 space-y-4">
          <p className="text-sm text-zinc-400">
            {error ?? "Could not load electability scores."}
          </p>
          <button
            type="button"
            onClick={() => void loadMatches()}
            className="text-[11px] font-medium uppercase tracking-widest text-gold underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {stage === "ready" && (
        <div className="mt-8 grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-3">
          {LEVELS.map((level) => {
            const rows = columns[level.id];

            return (
              <Card
                key={level.id}
                className="flex min-h-[22rem] max-h-[70vh] flex-col overflow-hidden bg-zinc-900"
              >
                <CardHeader className="shrink-0 border-b border-gold/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-widest text-gold">
                      {level.label}
                    </p>
                    <span className="rounded-full border border-gold/40 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                      Filing
                    </span>
                  </div>
                  <CardTitle className="font-display text-lg text-parchment">
                    Matched elections
                  </CardTitle>
                  <CardDescription>
                    Ranked by electability · {rows.length}{" "}
                    {rows.length === 1 ? "seat" : "seats"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col overflow-y-auto pt-4">
                  {rows.length === 0 ? (
                    <div className="flex flex-1 flex-col items-start justify-center py-8">
                      <p className="font-display text-sm font-semibold tracking-tight text-parchment">
                        {level.empty.title}
                      </p>
                      <p className="mt-2 max-w-[16rem] text-sm leading-6 text-zinc-400">
                        {level.empty.body}
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
        </div>
      )}
    </section>
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
      <div className="rounded-xl border border-gold/40 bg-zinc-950 p-4 transition-colors hover:border-gold">
        <p className="text-[11px] font-medium uppercase tracking-widest text-gold/80">
          {match.district.historical_lean ?? "Lean unpublished"}
        </p>
        <p className="mt-1 font-display text-sm font-semibold leading-snug tracking-tight text-parchment">
          {match.district.name}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Ideology Match
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-parchment">
              {formatMatchPct(match.ideological_match_pct)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              Electability
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums tracking-tight text-parchment",
                !eligible && "text-zinc-500",
              )}
            >
              {formatElectability(match.electability_multiplier)}
            </p>
            {!eligible ? (
              <p className="mt-1 text-[11px] uppercase tracking-widest text-zinc-500">
                Ineligible
              </p>
            ) : (
              <p className="mt-1 text-[11px] uppercase tracking-widest text-gold">
                Qualified
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
              outlook.favored === "Primary"
                ? "bg-gold-strong text-zinc-950"
                : "border border-gold/40 text-zinc-400",
            )}
          >
            Primary {outlook.primaryPct}%
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-widest",
              outlook.favored === "General"
                ? "bg-gold-strong text-zinc-950"
                : "border border-gold/40 text-zinc-400",
            )}
          >
            General {outlook.generalPct}%
          </span>
        </div>
      </div>
    </Link>
  );
}

async function persistResidency(
  userId: string,
  zip: string,
  districts: Pick<District, "zip_code" | "state" | "level">[],
) {
  const localEligible = districts.some(
    (district) =>
      districtLevel(district.level) === "local" &&
      zipMatches(zip, district.zip_code),
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
