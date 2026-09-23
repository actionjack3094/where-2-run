import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";

export type ArenaUser = {
  id: string;
  username: string;
};

function fallbackUsername(userId: string) {
  return `runner-${userId.slice(0, 6)}`;
}

const DISTRICT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDistrictForeignKey(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "23503" || /users_target_district_id_fkey/i.test(message);
}

function isDuplicateProfile(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "23505" || /users_pkey|duplicate key value/i.test(message);
}

/** Session storage can hold a district id from before a database reset. */
async function filedDistrictId(raw: string | null) {
  const districtId = raw?.trim() ?? "";
  if (!DISTRICT_UUID.test(districtId)) return null;

  const { data, error } = await supabase
    .from("districts")
    .select("id")
    .eq("id", districtId)
    .maybeSingle();

  if (error || !data?.id) {
    window.sessionStorage.removeItem(STORAGE_KEYS.districtId);
    return null;
  }
  return data.id;
}

export async function ensureArenaUser(
  preferredUsername?: string,
): Promise<ArenaUser> {
  const { data: sessionData } = await supabase.auth.getSession();
  let user = sessionData.session?.user ?? null;

  if (!user) {
    const email = `arena-${crypto.randomUUID()}@where2run.local`;
    const password = `${crypto.randomUUID()}Aa1!`;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Could not open an arena session.");
    }
    user = data.user;
  }

  const storedName = window.sessionStorage.getItem(STORAGE_KEYS.username);
  let username =
    preferredUsername?.trim() || storedName?.trim() || fallbackUsername(user.id);

  const { data: existing } = await supabase
    .from("users")
    .select("id, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const districtId = await filedDistrictId(
      window.sessionStorage.getItem(STORAGE_KEYS.districtId),
    );
    const vectorRaw = window.sessionStorage.getItem(STORAGE_KEYS.vector);
    const vector =
      vectorRaw && vectorRaw.trim().startsWith("[") ? vectorRaw : null;
    const insertPayload = {
      id: user.id,
      username,
      ...(districtId ? { target_district_id: districtId } : {}),
      ideology_vector: vector,
    };

    let payload: {
      id: string;
      username: string;
      target_district_id?: string | null;
      ideology_vector: string | null;
    } = insertPayload;
    let { error } = await supabase.from("users").insert(payload);
    if (error && isDistrictForeignKey(error)) {
      window.sessionStorage.removeItem(STORAGE_KEYS.districtId);
      payload = { id: user.id, username, ideology_vector: vector };
      ({ error } = await supabase.from("users").insert(payload));
    }
    if (error && isDuplicateProfile(error)) {
      const raced = await supabase
        .from("users")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      if (!raced.data?.username) throw new Error(error.message);
      username = raced.data.username;
    } else if (error) {
      username = `${username}-${user.id.slice(0, 4)}`;
      const retry = await supabase.from("users").insert({ ...payload, username });
      if (retry.error && isDuplicateProfile(retry.error)) {
        const raced = await supabase
          .from("users")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();
        if (!raced.data?.username) throw new Error(retry.error.message);
        username = raced.data.username;
      } else if (retry.error) {
        throw new Error(retry.error.message);
      }
    }
  } else if (preferredUsername?.trim() && preferredUsername.trim() !== existing.username) {
    const nextName = preferredUsername.trim();
    const { error } = await supabase
      .from("users")
      .update({ username: nextName })
      .eq("id", user.id);
    username = error ? existing.username : nextName;
  } else {
    username = existing.username;
  }

  window.sessionStorage.setItem(STORAGE_KEYS.username, username);
  return { id: user.id, username };
}
