import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { freezeDuePrimaries } from "@/lib/platform/freeze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await freezeDuePrimaries();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not freeze primaries.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
