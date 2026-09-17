import { NextResponse } from "next/server";
import { evaluateConsistency } from "@/lib/arena/consistency";
import { TOTAL_ROUNDS } from "@/lib/arena/time";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      debateId?: string;
      authorId?: string;
      roundNumber?: number;
      content?: string;
    };

    const content = body.content?.trim();
    const roundNumber = body.roundNumber;
    if (!body.debateId || !body.authorId || !content || !roundNumber) {
      return NextResponse.json({ error: "Incomplete argument." }, { status: 400 });
    }
    if (roundNumber < 1 || roundNumber > TOTAL_ROUNDS) {
      return NextResponse.json({ error: "Round must be 1, 2, or 3." }, { status: 400 });
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

    const isCandidate =
      body.authorId === debate.candidate_a_id || body.authorId === debate.candidate_b_id;
    if (!isCandidate) {
      return NextResponse.json({ error: "Only the two candidates can argue." }, { status: 403 });
    }

    const { data: existing } = await admin
      .from("arguments")
      .select("id")
      .eq("debate_id", body.debateId)
      .eq("author_id", body.authorId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This round is already filed." }, { status: 409 });
    }

    const evaluation = evaluateConsistency(content, debate.topic);
    const { data, error } = await admin
      .from("arguments")
      .insert({
        debate_id: body.debateId,
        author_id: body.authorId,
        round_number: roundNumber,
        content,
        consistency_score: evaluation.score,
        consistency_critique: evaluation.critique,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not file the argument." },
        { status: 500 },
      );
    }

    const { data: roundArgs } = await admin
      .from("arguments")
      .select("id")
      .eq("debate_id", body.debateId)
      .eq("round_number", roundNumber);

    if ((roundArgs?.length ?? 0) >= 2 && debate.candidate_a_id && debate.candidate_b_id) {
      const nextRound = Math.min(TOTAL_ROUNDS, roundNumber + 1);
      const nextStatus =
        roundNumber >= TOTAL_ROUNDS ? "voting" : debate.status === "matching" ? "active" : debate.status;
      await admin
        .from("debates")
        .update({
          current_round: roundNumber >= TOTAL_ROUNDS ? TOTAL_ROUNDS : nextRound,
          status: nextStatus,
        })
        .eq("id", body.debateId);
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not file the argument.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
