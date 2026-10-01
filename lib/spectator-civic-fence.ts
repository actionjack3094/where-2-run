import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CIVIC_FENCE_BALLOT_ERROR,
  spectatorMayVote,
} from "@/lib/civic-fencing";
import type { AppDatabase } from "@/types/database.types";

type FenceClient = SupabaseClient<AppDatabase>;

type DebateFenceRow = {
  election_question_id: string | null;
  election_id: string | null;
  district_id: string | null;
};

type ProfileFenceRow = {
  target_district_id: string | null;
  home_ocd_ids?: string[] | null;
  ocd_identifiers: string[] | null;
};

function asOcdIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function loadElectionFence(supabase: FenceClient, debate: DebateFenceRow) {
  let electionId: string | null = null;

  if (debate.election_question_id) {
    const { data, error } = await supabase
      .from("election_questions")
      .select("election_id")
      .eq("id", debate.election_question_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    electionId = (data as { election_id: string | null } | null)?.election_id ?? null;
  }

  if (!electionId) electionId = debate.election_id;

  if (!electionId) {
    return { districtId: debate.district_id, ocdId: null as string | null };
  }

  const { data, error } = await supabase
    .from("elections")
    .select("district_id, ocd_id")
    .eq("id", electionId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const election = data as { district_id: string | null; ocd_id: string | null } | null;
  return {
    districtId: election?.district_id ?? debate.district_id,
    ocdId: election?.ocd_id ?? null,
  };
}

export async function assertSpectatorCivicFence(
  supabase: FenceClient,
  userId: string,
  debateId: string,
) {
  const { data: debateRow, error: debateError } = await supabase
    .from("debates")
    .select("election_question_id, election_id, district_id")
    .eq("id", debateId)
    .maybeSingle();

  if (debateError) throw new Error(debateError.message);
  if (!debateRow) throw new Error("Debate not found.");

  const election = await loadElectionFence(supabase, debateRow as DebateFenceRow);

  const { data: profileRow, error: profileError } = await supabase
    .from("users")
    .select("target_district_id, home_ocd_ids, ocd_identifiers")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  const profile = (profileRow as ProfileFenceRow | null) ?? null;
  const allowed = spectatorMayVote({
    electionDistrictId: election.districtId,
    profileDistrictId: profile?.target_district_id ?? null,
    electionOcdId: election.ocdId,
    ocdIdentifiers: asOcdIds(profile?.ocd_identifiers),
    homeOcdIds: asOcdIds(profile?.home_ocd_ids),
  });

  if (!allowed) {
    throw new Error(CIVIC_FENCE_BALLOT_ERROR);
  }
}
