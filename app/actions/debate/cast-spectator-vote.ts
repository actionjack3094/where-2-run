"use server";

import { recordSpectatorVote } from "@/lib/actions/debate-votes";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { createServerSupabase } from "@/lib/db/supabase-server";

export async function castSpectatorVote(debateId: string, votedForUserId: string) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to respond.");

  const admin = createAdminClient();
  const { data: debate, error: debateError } = await admin
    .from("debates")
    .select("candidate_a_id, candidate_b_id")
    .eq("id", debateId)
    .maybeSingle();
  if (debateError) throw new Error(debateError.message);
  if (!debate?.candidate_a_id || !debate.candidate_b_id) {
    throw new Error("Both debaters must be seated before you can respond.");
  }
  if (votedForUserId !== debate.candidate_a_id && votedForUserId !== debate.candidate_b_id) {
    throw new Error("Choose one of the seated debaters.");
  }

  const recorded = await recordSpectatorVote(admin, {
    debateId,
    spectatorId: user.id,
    votedForUserId,
  });
  if (recorded.duplicate) throw new Error("You already responded to this topic.");
  if (recorded.error) throw new Error(recorded.error.message);

  return { recorded: true as const, selection: votedForUserId };
}
