import { NextResponse } from "next/server";
import { applyDebateGrade } from "@/lib/arena/apply-grade";
import { requireAuthenticatedUserId } from "@/lib/arena/auth";
import { evaluateConsistency } from "@/lib/arena/consistency";
import { TOTAL_ROUNDS } from "@/lib/arena/time";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      match_id?: string;
      round_number?: number | string;
      argument_text?: string;
    };

    const matchId = body.match_id?.trim();
    const argumentText = body.argument_text?.trim();
    const roundNumber = Number(body.round_number);

    if (!matchId || !argumentText || !Number.isInteger(roundNumber)) {
      return NextResponse.json(
        { error: "match_id, round_number, and argument_text are required." },
        { status: 400 },
      );
    }
    if (roundNumber < 1 || roundNumber > TOTAL_ROUNDS) {
      return NextResponse.json({ error: "Round must be 1, 2, or 3." }, { status: 400 });
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

    const isCandidateA = userId === debate.candidate_a_id;
    const isCandidateB = userId === debate.candidate_b_id;
    if (!isCandidateA && !isCandidateB) {
      return NextResponse.json(
        { error: "Only the two candidates can argue." },
        { status: 403 },
      );
    }

    if (!debate.candidate_a_id || !debate.candidate_b_id) {
      return NextResponse.json(
        { error: "Both candidates must be seated before arguments lock in." },
        { status: 400 },
      );
    }

    if (debate.status !== "active" && debate.status !== "matching") {
      return NextResponse.json(
        { error: "This match is not accepting arguments." },
        { status: 403 },
      );
    }

    if (roundNumber !== debate.current_round) {
      return NextResponse.json(
        { error: "That round is not open yet." },
        { status: 400 },
      );
    }

    const { data: roundArgs, error: roundError } = await admin
      .from("arguments")
      .select("id, author_id")
      .eq("debate_id", matchId)
      .eq("round_number", roundNumber);

    if (roundError) {
      return NextResponse.json({ error: roundError.message }, { status: 500 });
    }

    const aFiled = (roundArgs ?? []).some((row) => row.author_id === debate.candidate_a_id);
    const bFiled = (roundArgs ?? []).some((row) => row.author_id === debate.candidate_b_id);
    const expectedUserId = !aFiled
      ? debate.candidate_a_id
      : !bFiled
        ? debate.candidate_b_id
        : null;

    if (!expectedUserId) {
      return NextResponse.json({ error: "This round is already locked." }, { status: 409 });
    }
    if (expectedUserId !== userId) {
      return NextResponse.json({ error: "It is not your turn." }, { status: 403 });
    }

    const evaluation = evaluateConsistency(argumentText, debate.topic);
    const payload = {
      content: argumentText,
      consistency_score: evaluation.score,
      consistency_critique: evaluation.critique,
    };

    const { data: existing } = await admin
      .from("arguments")
      .select("id")
      .eq("debate_id", matchId)
      .eq("author_id", userId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    const written = existing
      ? await admin.from("arguments").update(payload).eq("id", existing.id).select("*").single()
      : await admin
          .from("arguments")
          .insert({
            debate_id: matchId,
            author_id: userId,
            round_number: roundNumber,
            ...payload,
          })
          .select("*")
          .single();

    const argument = written.data;
    if (written.error || !argument) {
      return NextResponse.json(
        { error: written.error?.message ?? "Could not lock in the argument." },
        { status: 500 },
      );
    }

    const opponentId = isCandidateA ? debate.candidate_b_id : debate.candidate_a_id;
    const roundComplete = isCandidateB;
    const nextRound = roundComplete
      ? Math.min(TOTAL_ROUNDS, roundNumber + 1)
      : roundNumber;
    const nextStatus = roundComplete && roundNumber >= TOTAL_ROUNDS ? "voting" : "active";

    const { error: turnError } = await admin
      .from("debates")
      .update({
        current_round: roundComplete && roundNumber >= TOTAL_ROUNDS ? TOTAL_ROUNDS : nextRound,
        status: nextStatus,
      })
      .eq("id", matchId);

    if (turnError) {
      return NextResponse.json({ error: turnError.message }, { status: 500 });
    }

    try {
      await applyDebateGrade(admin, argument);
    } catch (gradeError) {
      console.error("AI Grader failed after filing", gradeError);
    }

    return NextResponse.json(
      {
        ok: true,
        argument,
        active_turn_id: roundComplete && roundNumber >= TOTAL_ROUNDS ? null : opponentId,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not lock in the argument.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
