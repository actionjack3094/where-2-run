import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { candidateBId?: string };
    if (!body.candidateBId) {
      return NextResponse.json({ error: "A challenger is required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: debate, error: loadError } = await admin
      .from("debates")
      .select("*")
      .eq("id", id)
      .single();

    if (loadError || !debate) {
      return NextResponse.json({ error: "Debate not found." }, { status: 404 });
    }
    if (debate.candidate_b_id) {
      return NextResponse.json({ error: "This debate already has a challenger." }, { status: 409 });
    }
    if (debate.candidate_a_id === body.candidateBId) {
      return NextResponse.json({ error: "You are already on the ticket." }, { status: 400 });
    }

    const { data, error } = await admin
      .from("debates")
      .update({
        candidate_b_id: body.candidateBId,
        status: "active",
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not join the debate." },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join the debate.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
