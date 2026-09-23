"use server";

import { requireActionUserId } from "@/lib/arena/auth";
import { createAdminClient } from "@/lib/db/supabase-admin";

type WriteError = { message?: string; code?: string; status?: number } | null;

function isMissingAuthUser(error: WriteError) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.status === 404 ||
    error.code === "user_not_found" ||
    /user from sub claim in jwt does not exist|not found/i.test(message)
  );
}

function isDuplicate(error: WriteError) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "23505" || /duplicate key|already exists|already been registered/i.test(message);
}

function emailFromAccessToken(accessToken?: string | null) {
  if (!accessToken) return null;
  const segment = accessToken.split(".")[1];
  if (!segment) return null;
  try {
    const json = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as {
      email?: unknown;
    };
    const email = typeof json.email === "string" ? json.email.trim().toLowerCase() : "";
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

async function ensureAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string | null,
) {
  const existing = await admin.auth.admin.getUserById(userId);
  if (existing.data?.user) return;
  if (existing.error && !isMissingAuthUser(existing.error)) {
    throw new Error(existing.error.message);
  }

  const fallback = `runner-${userId.slice(0, 8)}@where2run.local`;
  const preferred = email ?? fallback;
  let created = await admin.auth.admin.createUser({
    id: userId,
    email: preferred,
    email_confirm: true,
  });
  if (created.error && preferred !== fallback && isDuplicate(created.error)) {
    created = await admin.auth.admin.createUser({
      id: userId,
      email: fallback,
      email_confirm: true,
    });
  }
  if (created.error && !isDuplicate(created.error)) {
    throw new Error(created.error.message);
  }
}

/**
 * Public profiles reference auth.users. A database reset can leave the browser
 * holding a still-valid session for an auth row that no longer exists.
 */
export async function ensureArenaProfile(accessToken?: string | null) {
  const userId = await requireActionUserId(accessToken);
  if (!userId) throw new Error("Sign in to continue.");

  const admin = createAdminClient();
  await ensureAuthUser(admin, userId, emailFromAccessToken(accessToken));

  const { data: existing, error: readError } = await admin
    .from("users")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.username) return { id: userId, username: existing.username };

  let username = `runner-${userId.slice(0, 6)}`;
  let { error } = await admin.from("users").insert({ id: userId, username });
  if (error && isDuplicate(error)) {
    const raced = await admin.from("users").select("username").eq("id", userId).maybeSingle();
    if (raced.data?.username) return { id: userId, username: raced.data.username };
    username = `runner-${userId.slice(0, 8)}`;
    ({ error } = await admin.from("users").insert({ id: userId, username }));
  }
  if (error) throw new Error(error.message);
  return { id: userId, username };
}
