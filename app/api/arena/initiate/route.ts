import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAuthenticatedUserId(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const cookieStore = await cookies();
  const cookieClient = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    data: { user: cookieUser },
  } = await cookieClient.auth.getUser();
  if (cookieUser?.id) return cookieUser.id;

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const headerClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user: headerUser },
  } = await headerClient.auth.getUser(token);

  return headerUser?.id ?? null;
}

async function ensureUsersRow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing?.id) return;

  const username = `runner-${userId.slice(0, 6)}`;
  const { error } = await admin.from("users").insert({
    id: userId,
    username,
  });
  if (error) {
    throw new Error(error.message);
  }
}

async function resolveDistrictUuid(
  admin: ReturnType<typeof createAdminClient>,
  districtId: string,
) {
  if (UUID_RE.test(districtId)) {
    const { data } = await admin
      .from("districts")
      .select("id")
      .eq("id", districtId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data } = await admin
    .from("districts")
    .select("id")
    .eq("name", districtId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { post_id?: string };
    const postId = body.post_id?.trim();
    if (!postId) {
      return NextResponse.json({ error: "post_id is required." }, { status: 400 });
    }

    const userId = await requireAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    await ensureUsersRow(admin, userId);

    const { data: post, error: postError } = await admin
      .from("civic_posts")
      .select("*")
      .eq("id", postId)
      .maybeSingle();

    if (postError || !post) {
      return NextResponse.json({ error: "Stance not found." }, { status: 404 });
    }

    if (post.author_id === userId) {
      return NextResponse.json(
        { error: "You cannot challenge your own stance." },
        { status: 400 },
      );
    }

    const districtId = await resolveDistrictUuid(admin, post.district_id);

    const { data: debate, error: debateError } = await admin
      .from("debates")
      .insert({
        topic: post.claim,
        district_id: districtId,
        candidate_a_id: post.author_id,
        candidate_b_id: userId,
        status: "active",
        current_round: 1,
      })
      .select("id")
      .single();

    if (debateError || !debate) {
      return NextResponse.json(
        { error: debateError?.message ?? "Could not start the debate." },
        { status: 500 },
      );
    }

    await admin
      .from("civic_posts")
      .update({ status: "challenged" })
      .eq("id", postId);

    return NextResponse.json({ match_id: debate.id }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start the debate.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
