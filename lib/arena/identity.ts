import { supabase } from "@/lib/db/supabase";
import { STORAGE_KEYS } from "@/lib/session";

export type ArenaUser = {
  id: string;
  username: string;
};

function fallbackUsername(userId: string) {
  return `runner-${userId.slice(0, 6)}`;
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
    const districtId = window.sessionStorage.getItem(STORAGE_KEYS.districtId);
    const vectorRaw = window.sessionStorage.getItem(STORAGE_KEYS.vector);
    const vector =
      vectorRaw && vectorRaw.trim().startsWith("[") ? vectorRaw : null;
    const insertPayload = {
      id: user.id,
      username,
      target_district_id: districtId,
      ideology_vector: vector,
    };

    const { error } = await supabase.from("users").insert(insertPayload);
    if (error) {
      username = `${username}-${user.id.slice(0, 4)}`;
      const retry = await supabase.from("users").insert({
        ...insertPayload,
        username,
      });
      if (retry.error) {
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
