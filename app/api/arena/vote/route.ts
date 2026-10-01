import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/arena/auth";
import { settleExpiredDebateElo } from "@/lib/arena/apply-elo";
import { recordSpectatorVote } from "@/lib/actions/debate-votes";
import { CIVIC_FENCE_BALLOT_ERROR } from "@/lib/civic-fencing";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { assertSpectatorCivicFence } from "@/lib/spectator-civic-fence";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      match_id?: string;
      voted_for?: string;
    };

    const matchId = body.match_id?.trim();
    const votedFor = body.voted_for?.trim().toLowerCase();

    if (!matchId || (votedFor !== "a" && votedFor !== "b")) {
      return NextResponse.json(
        { error: "match_id and voted_for ('a' or 'b') are required." },
        { status: 400 },
      );
    }

    const userId = await requireAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: debate, error: debateError } = await admin
      .from("debates")
      .select("*")
      .eq("id", matchId)
      .single();

    if (debateError || !debate) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    if (!debate.candidate_a_id || !debate.candidate_b_id) {
      return NextResponse.json(
        { error: "Both candidates must be seated before voting." },
        { status: 400 },
      );
    }

    if (debate.status !== "active" && debate.status !== "voting") {
      return NextResponse.json(
        { error: "Voting is only open on active debates." },
        { status: 403 },
      );
    }

    const candidateId =
      votedFor === "a" ? debate.candidate_a_id : debate.candidate_b_id;

    const { data: existingVote } = await admin
      .from("debate_votes")
      .select("id")
      .eq("match_id", matchId)
      .eq("spectator_id", userId)
      .maybeSingle();

    if (!existingVote) {
      const { data: legacyVote } = await admin
        .from("votes")
        .select("id")
        .eq("debate_id", matchId)
        .eq("voter_id", userId)
        .maybeSingle();
      if (legacyVote) {
        return NextResponse.json({ error: "You already voted in this debate." }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: "You already voted in this debate." }, { status: 409 });
    }

    try {
      await assertSpectatorCivicFence(admin, userId, matchId);
    } catch (fenceError) {
      const message =
        fenceError instanceof Error ? fenceError.message : CIVIC_FENCE_BALLOT_ERROR;
      const status = message === CIVIC_FENCE_BALLOT_ERROR ? 403 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const recorded = await recordSpectatorVote(admin, {
      matchId,
      spectatorId: userId,
      voteForUserId: candidateId,
    });

    if (recorded.duplicate) {
      return NextResponse.json({ error: "You already voted in this debate." }, { status: 409 });
    }
    if (recorded.error) {
      return NextResponse.json({ error: recorded.error.message }, { status: 500 });
    }

    try {
      await settleExpiredDebateElo(admin, matchId);
    } catch (eloError) {
      console.error("ELO update failed after vote", eloError);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the vote.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
