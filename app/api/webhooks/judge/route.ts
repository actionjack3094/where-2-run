import { NextResponse } from "next/server";
import { resolveDebateWithTally } from "@/lib/actions/debate-resolution";
import { evaluateDebateTranscript } from "@/lib/ai/judge";
import { isUuid } from "@/lib/arena/display";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function debateIdFrom(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = (body as { debate_id?: unknown }).debate_id;
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const debateId = debateIdFrom(body);
  if (!isUuid(debateId)) {
    return NextResponse.json({ error: "A debate_id is required." }, { status: 400 });
  }

  try {
    const verdict = await evaluateDebateTranscript(debateId);
    const resolution = await resolveDebateWithTally(debateId, verdict);
    return NextResponse.json({
      received: true,
      debateId: resolution?.id ?? null,
      winnerId: resolution?.winnerId ?? null,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Judge failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
