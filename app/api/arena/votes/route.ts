import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      debateId?: string;
      voterId?: string;
      candidateId?: string;
    };

    if (!body.debateId || !body.voterId || !body.candidateId) {
      return NextResponse.json({ error: "Incomplete vote." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: debate, error: debateError } = await admin
      .from("debates")
      .select("*")
      .eq("id", body.debateId)
      .single();

    if (debateError || !debate) {
      return NextResponse.json({ error: "Debate not found." }, { status: 404 });
    }

    if (debate.status !== "active" && debate.status !== "voting") {
      return NextResponse.json({ error: "Voting is only open on active debates." }, { status: 403 });
    }

    if (!debate.candidate_a_id || !debate.candidate_b_id) {
      return NextResponse.json(
        { error: "Both candidates must be seated before voting." },
        { status: 400 },
      );
    }

    const onTicket =
      body.voterId === debate.candidate_a_id || body.voterId === debate.candidate_b_id;
    if (onTicket) {
      return NextResponse.json({ error: "Candidates cannot vote in their own debate." }, { status: 403 });
    }

    const validCandidate =
      body.candidateId === debate.candidate_a_id || body.candidateId === debate.candidate_b_id;
    if (!validCandidate) {
      return NextResponse.json({ error: "Vote must go to a candidate on the ticket." }, { status: 400 });
    }

    const { data: existingVote } = await admin
      .from("votes")
      .select("id")
      .eq("debate_id", body.debateId)
      .eq("voter_id", body.voterId)
      .maybeSingle();

    if (existingVote) {
      return NextResponse.json({ error: "You already voted in this debate." }, { status: 409 });
    }

    const { data, error } = await admin
      .from("votes")
      .insert({
        debate_id: body.debateId,
        voter_id: body.voterId,
        candidate_id: body.candidateId,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "You already voted in this debate." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the vote.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
