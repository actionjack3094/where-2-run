import { NextResponse } from "next/server";
import { volunteerCsv } from "@/lib/actions/campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await volunteerCsv();
  if (result.error || !result.csv) {
    const status = result.error === "Sign in to export volunteers." ? 401 : 403;
    return NextResponse.json({ error: result.error ?? "Could not export volunteers." }, { status });
  }

  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="volunteers.csv"',
    },
  });
}
