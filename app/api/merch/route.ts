import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import {
  createMockPrintfulOrder,
  findMerchItem,
  generateCandidateMerch,
  type MerchCandidate,
} from "@/lib/merch";

type MerchOrderBody = {
  candidateId?: string;
  productId?: number;
  variantId?: number;
  quantity?: number;
};

async function loadCandidate(candidateId: string): Promise<MerchCandidate | null> {
  const admin = createAdminClient();
  const { data: stats, error: statsError } = await admin
    .from("candidate_stats")
    .select("id, username, target_district_id")
    .eq("id", candidateId)
    .maybeSingle();

  if (statsError) {
    throw new Error(statsError.message);
  }
  if (!stats) return null;

  let districtName = "District TBA";
  let districtLevel: string | null = null;
  if (stats.target_district_id) {
    const { data: district, error: districtError } = await admin
      .from("districts")
      .select("id, name, level")
      .eq("id", stats.target_district_id)
      .maybeSingle();
    if (districtError) {
      throw new Error(districtError.message);
    }
    districtName = district?.name ?? districtName;
    districtLevel = district?.level ?? null;
  }

  return {
    id: stats.id,
    name: stats.username,
    districtId: stats.target_district_id,
    districtName,
    districtLevel,
  };
}

export async function GET(request: NextRequest) {
  try {
    const candidateId = request.nextUrl.searchParams.get("candidateId")?.trim();
    if (!candidateId || !isUuid(candidateId)) {
      return NextResponse.json(
        { error: "A valid candidate ID is required." },
        { status: 400 },
      );
    }

    const candidate = await loadCandidate(candidateId);
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    }

    return NextResponse.json(generateCandidateMerch(candidate));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load campaign merch.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MerchOrderBody;
    const candidateId = body.candidateId?.trim();
    const productId = Number(body.productId);
    const variantId = Number(body.variantId);
    const quantity = Number(body.quantity ?? 1);

    if (!candidateId || !isUuid(candidateId)) {
      return NextResponse.json(
        { error: "A valid candidate ID is required." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(productId) || !Number.isInteger(variantId)) {
      return NextResponse.json(
        { error: "A product variant is required." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return NextResponse.json(
        { error: "Quantity must be between 1 and 20." },
        { status: 400 },
      );
    }

    const candidate = await loadCandidate(candidateId);
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    }

    const catalog = generateCandidateMerch(candidate);
    const match = findMerchItem(catalog.products, productId, variantId);
    if (!match) {
      return NextResponse.json(
        { error: "That product variant is not in this campaign store." },
        { status: 404 },
      );
    }

    const order = createMockPrintfulOrder({
      candidate,
      product: match.product,
      variant: match.variant,
      quantity,
    });

    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not place the merch order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
