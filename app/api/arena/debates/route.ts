import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      topic?: string;
      districtId?: string | null;
      candidateAId?: string;
    };

    const topic = body.topic?.trim();
    if (!topic) {
      return NextResponse.json({ error: "A debate topic is required." }, { status: 400 });
    }
    if (!body.candidateAId) {
      return NextResponse.json({ error: "Candidate A is required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("debates")
      .insert({
        topic,
        district_id: body.districtId ?? null,
        candidate_a_id: body.candidateAId,
        status: "matching",
        current_round: 1,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create the debate." },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the debate.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
