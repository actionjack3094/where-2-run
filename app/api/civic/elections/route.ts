import { NextRequest, NextResponse } from "next/server";
import { syncElectionCycles } from "@/lib/civic/sync-elections";
import { isCronAuthorized } from "@/lib/cron/auth";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ocdId = request.nextUrl.searchParams.get("ocdId");
    const result = await syncElectionCycles(ocdId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync election cycles.";
    const status = /not configured/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
