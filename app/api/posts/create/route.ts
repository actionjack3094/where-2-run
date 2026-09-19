import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { buildCivicIdeologyVector, formatCivicVector } from "@/lib/ideology/civic-vector";
import type { CivicStance } from "@/types/database.types";

const STANCES = new Set<CivicStance>(["Affirmative", "Negative"]);

function isCivicStance(value: string): value is CivicStance {
  return STANCES.has(value as CivicStance);
}

async function resolveAuthorId(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string> {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (existing?.id) return existing.id;

      const username = `runner-${user.id.slice(0, 6)}`;
      const { error } = await admin.from("users").insert({
        id: user.id,
        username,
      });
      if (!error) return user.id;
    }
  }

  const { data: fallback, error } = await admin.from("users").select("id").limit(1).maybeSingle();
  if (error || !fallback?.id) {
    throw new Error("Could not resolve an author for this stance.");
  }
  return fallback.id;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      claim?: string;
      stance?: string;
      argument?: string;
      district_id?: string;
    };

    const claim = body.claim?.trim() ?? "";
    const stance = body.stance?.trim() ?? "";
    const argument = body.argument?.trim() ?? "";
    const districtId = body.district_id?.trim() ?? "";

    if (!claim || !stance || !argument || !districtId) {
      return NextResponse.json(
        { error: "claim, stance, argument, and district_id are required." },
        { status: 400 },
      );
    }

    if (!isCivicStance(stance)) {
      return NextResponse.json(
        { error: "stance must be Affirmative or Negative." },
        { status: 400 },
      );
    }

    const ideologyVector = formatCivicVector(
      buildCivicIdeologyVector(claim, argument, stance),
    );

    const admin = createAdminClient();
    const authorId = await resolveAuthorId(admin);

    const { data, error } = await admin
      .from("civic_posts")
      .insert({
        author_id: authorId,
        district_id: districtId,
        claim,
        stance,
        argument,
        ideology_vector: ideologyVector,
        status: "open",
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not publish the stance." },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish the stance.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
