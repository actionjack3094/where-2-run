import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/arena/auth";
import { routeVoterAddress } from "@/lib/civic/lookup-address";

export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sign in to look up a district." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { address?: string } | null;
    const address = body?.address?.trim() ?? "";
    if (!address) {
      return NextResponse.json({ error: "Enter a street address." }, { status: 400 });
    }

    const assignment = await routeVoterAddress(userId, address);
    revalidatePath("/feed");
    revalidatePath("/onboarding/district");
    revalidatePath("/my-campaign");

    return NextResponse.json(assignment, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not route that address.";
    const status = /not configured/i.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
