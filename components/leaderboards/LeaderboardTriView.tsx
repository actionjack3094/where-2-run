"use client";

import { useEffect, useState } from "react";
import { BackCandidateButton } from "@/components/pledges/BackCandidateButton";
import { CandidateIdentity } from "@/components/profile/CandidateAvatar";
import { DEFAULT_STANCE_DISTRICT } from "@/components/TakeStanceModal";
import { ensureArenaUser } from "@/lib/arena/identity";
import { supabase } from "@/lib/db/supabase";
import { formatElectability, zipMatches } from "@/lib/electability";
import {
  formatRecord,
  mergeLeaderboardEntries,
  NATIONAL_STANDING_LIMIT,
  type LeaderboardEntry,
  type ScoreSlice,
} from "@/lib/leaderboard";
import { STORAGE_KEYS } from "@/lib/session";
import type { CandidateStats, Debate, District, UserProfile } from "@/types/database.types";

type BoardId = "contests" | "ballot" | "national";
type LoadStage = "loading" | "ready" | "error";

type Boards = {
  contests: LeaderboardEntry[];
  ballot: LeaderboardEntry[];
  national: LeaderboardEntry[];
  homeDistrictName: string | null;
};

const BOARDS: {
  id: BoardId;
  title: string;
  hint: (home: string | null) => string;
  empty: (home: string | null) => string;
}[] = [
  {
    id: "contests",
    title: "My Contests",
    hint: () => "Elections where you are ranked or already on the ticket.",
    empty: () =>
      "You are not ranked in a contest yet. File a district or win a debate to open this board.",
  },
  {
    id: "ballot",
    title: "My Ballot",
    hint: (home) =>
      home
        ? `Candidates running in ${home}.`
        : "Candidates running in your registered home district.",
    empty: (home) =>
      home
        ? `No candidates have filed in ${home} yet.`
        : "Save a home district to see who is on your ballot.",
  },
  {
    id: "national",
    title: "National Standouts",
    hint: () => "Highest electability scores across the entire platform.",
    empty: () => "No electability scores on the national board yet.",
  },
];

export function LeaderboardTriView() {
  const [stage, setStage] = useState<LoadStage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<Boards>({
    contests: [],
    ballot: [],
    national: [],
    homeDistrictName: null,
  });

  async function loadBoards() {
    setError(null);
    setStage("loading");

    try {
      const arenaUser = await ensureArenaUser();
      const storedDistrictId = window.sessionStorage.getItem(STORAGE_KEYS.districtId);
      const storedZip = window.sessionStorage.getItem(STORAGE_KEYS.residencyZip);

      const [
        { data: profileRow, error: profileError },
        { data: districtRows, error: districtError },
        { data: statsRows, error: statsError },
        { data: scoreRows, error: scoreError },
        { data: debateRows, error: debateError },
      ] = await Promise.all([
        supabase
          .from("users")
          .select("id, username, target_district_id, residency_zip")
          .eq("id", arenaUser.id)
          .maybeSingle(),
        supabase.from("districts").select("id, name, zip_code").order("name"),
        supabase
          .from("candidate_stats")
          .select(
            "id, username, debates_won, debates_played, target_district_id, verification_tier",
          ),
        supabase
          .from("electability_scores")
          .select(
            "user_id, district_id, electability_multiplier, users(id, username, verification_tier), districts(id, name)",
          )
          .order("electability_multiplier", { ascending: false }),
        supabase
          .from("debates")
          .select("district_id, candidate_a_id, candidate_b_id")
          .or(`candidate_a_id.eq.${arenaUser.id},candidate_b_id.eq.${arenaUser.id}`),
      ]);

      if (profileError) throw new Error(profileError.message);
      if (districtError) throw new Error(districtError.message);
      if (statsError) throw new Error(statsError.message);
      if (scoreError) throw new Error(scoreError.message);
      if (debateError) throw new Error(debateError.message);

      const profile = profileRow as Pick<
        UserProfile,
        "id" | "username" | "target_district_id" | "residency_zip"
      > | null;
      const districts = (districtRows ?? []) as Pick<District, "id" | "name" | "zip_code">[];
      const stats = (statsRows ?? []) as Pick<
        CandidateStats,
        | "id"
        | "username"
        | "debates_won"
        | "debates_played"
        | "target_district_id"
        | "verification_tier"
      >[];
      const scores = (scoreRows ?? []) as ScoreSlice[];
      const debates = (debateRows ?? []) as Pick<
        Debate,
        "district_id" | "candidate_a_id" | "candidate_b_id"
      >[];

      const home =
        districts.find((entry) => entry.id === storedDistrictId) ??
        districts.find((entry) => entry.id === profile?.target_district_id) ??
        districts.find((entry) => zipMatches(storedZip ?? profile?.residency_zip, entry.zip_code)) ??
        districts.find((entry) => entry.name === DEFAULT_STANCE_DISTRICT) ??
        districts[0] ??
        null;

      if (home) {
        window.sessionStorage.setItem(STORAGE_KEYS.districtId, home.id);
      }

      const contestIds = new Set<string>();
      if (profile?.target_district_id) contestIds.add(profile.target_district_id);
      const myStats = stats.find((row) => row.id === arenaUser.id);
      if (myStats?.target_district_id) contestIds.add(myStats.target_district_id);
      for (const debate of debates) {
        if (debate.district_id) contestIds.add(debate.district_id);
      }

      const candidateIds = [...new Set(stats.map((row) => row.id))];
      const { data: argumentRows, error: argumentError } =
        candidateIds.length > 0
          ? await supabase
              .from("arguments")
              .select("author_id, consistency_score")
              .in("author_id", candidateIds)
              .not("consistency_score", "is", null)
          : { data: [], error: null };

      if (argumentError) throw new Error(argumentError.message);

      const consistencies = (argumentRows ?? []) as {
        author_id: string;
        consistency_score: number | string | null;
      }[];

      const contests = contestIds.size
        ? mergeLeaderboardEntries({
            stats: stats.filter(
              (row) => row.target_district_id && contestIds.has(row.target_district_id),
            ),
            scores: scores.filter((row) => contestIds.has(row.district_id)),
            consistencies,
            districts,
          })
        : [];

      const ballot = home
        ? mergeLeaderboardEntries({
            stats: stats.filter((row) => row.target_district_id === home.id),
            scores: scores.filter((row) => row.district_id === home.id),
            consistencies,
            districts,
          })
        : [];

      const national = mergeLeaderboardEntries({
        stats,
        scores,
        consistencies,
        districts,
        bestScoreOnly: true,
      })
        .filter((entry) => entry.electability > 0)
        .slice(0, NATIONAL_STANDING_LIMIT);

      setBoards({
        contests,
        ballot,
        national,
        homeDistrictName: home?.name ?? null,
      });
      setStage("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load leaderboards.");
      setStage("error");
    }
  }

  useEffect(() => {
    void loadBoards();
  }, []);

  if (stage === "loading") {
    return <p className="mt-16 text-sm leading-6 text-zinc-400">Tallying the field…</p>;
  }

  if (stage === "error") {
    return (
      <div className="mt-16 space-y-4">
        <p className="text-sm leading-6 text-zinc-400">
          {error ?? "Could not load these leaderboards."}
        </p>
        <button
          type="button"
          onClick={() => void loadBoards()}
          className="inline-flex h-9 items-center justify-center rounded-md border border-gold/50 bg-zinc-800 px-3 text-xs font-medium uppercase tracking-widest text-parchment"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-col gap-12">
      {BOARDS.map((board) => (
        <RankingTable
          key={board.id}
          title={board.title}
          hint={board.hint(boards.homeDistrictName)}
          empty={board.empty(boards.homeDistrictName)}
          entries={boards[board.id]}
          showDistrict={board.id !== "ballot"}
        />
      ))}
    </div>
  );
}

function RankingTable({
  title,
  hint,
  empty,
  entries,
  showDistrict,
}: {
  title: string;
  hint: string;
  empty: string;
  entries: LeaderboardEntry[];
  showDistrict: boolean;
}) {
  return (
    <section>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Ranking
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-parchment">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{hint}</p>
      </header>

      {entries.length === 0 ? (
        <p className="mt-6 text-sm leading-6 text-zinc-400">{empty}</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-gold/50 bg-zinc-900 shadow-[inset_3px_0_0_0_var(--gold-strong)]">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-b border-gold/30 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                <th className="px-5 py-3 pl-6 font-medium">Rank</th>
                <th className="px-5 py-3 font-medium">Candidate</th>
                <th className="px-5 py-3 font-medium">Record</th>
                <th className="px-5 py-3 font-medium">Electability</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">Donate</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.id} className="border-t border-gold/15">
                  <td className="px-5 py-4 pl-6 align-middle font-mono text-sm tabular-nums text-zinc-500">
                    #{index + 1}
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <div className="flex min-w-0 flex-col gap-1">
                      <CandidateIdentity
                        id={entry.id}
                        username={entry.username}
                        size="sm"
                        nameClassName="text-base"
                        verificationTier={entry.verificationTier}
                      />
                      {showDistrict && entry.districtName ? (
                        <p className="pl-11 text-[11px] uppercase tracking-widest text-zinc-500">
                          {entry.districtName}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-middle text-sm font-medium tabular-nums text-zinc-100">
                    {formatRecord(entry.wins, entry.losses)}
                  </td>
                  <td className="px-5 py-4 align-middle text-sm font-medium tabular-nums text-gold">
                    {formatElectability(entry.electability)}
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <BackCandidateButton
                      candidate={{ id: entry.id, username: entry.username }}
                      className="shrink-0"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
