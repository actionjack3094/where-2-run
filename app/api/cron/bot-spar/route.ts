import { NextResponse } from "next/server";
import { sparDueBotSeats } from "@/lib/ai/bots";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await sparDueBotSeats(3);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not spar open prompts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
