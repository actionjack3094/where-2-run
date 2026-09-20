import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/arena/auth";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { ANONYMOUS_DONOR, formatUsd, MAX_PLEDGE_AMOUNT } from "@/lib/pledges";

type PledgeBody = {
  candidate_id?: string;
  amount?: number | string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PledgeBody;
    const candidateId = body.candidate_id?.trim() ?? "";
    const amount = Number(body.amount);

    if (!candidateId || !isUuid(candidateId)) {
      return NextResponse.json(
        { error: "A valid candidate_id is required." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Enter an amount greater than zero." },
        { status: 400 },
      );
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      return NextResponse.json(
        { error: `Pledges are capped at ${formatUsd(MAX_PLEDGE_AMOUNT)}.` },
        { status: 400 },
      );
    }

    const userId = await requireAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    const { data: candidate, error: candidateError } = await admin
      .from("users")
      .select("id")
      .eq("id", candidateId)
      .maybeSingle();

    if (candidateError) {
      return NextResponse.json({ error: candidateError.message }, { status: 500 });
    }
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    }

    const { data: donor } = await admin
      .from("users")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    const { data, error } = await admin
      .from("pledges")
      .insert({
        candidate_id: candidateId,
        donor_id: userId,
        amount,
        donor_name: donor?.username?.trim() || ANONYMOUS_DONOR,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not record the pledge." },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not record the pledge.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
