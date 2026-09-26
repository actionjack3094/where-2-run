import { NextRequest, NextResponse } from "next/server";
import { resolveDebate } from "@/lib/actions/debate-resolution";
import { createAdminClient } from "@/lib/db/supabase-admin";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("debates")
      .select("id")
      .eq("status", "voting")
      .lte("expires_at", now);

    if (error) throw new Error(error.message);

    const expiredIds = (data ?? []).map((debate) => debate.id);
    const resolved = (
      await Promise.all(expiredIds.map((id) => resolveDebate(id)))
    ).filter((id): id is string => id !== null);

    return NextResponse.json({ resolved }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve debates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
