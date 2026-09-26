import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

const url = supabaseUrl;
const anonKey = supabaseAnonKey;

export function createClient() {
  return createBrowserClient<AppDatabase>(url, anonKey);
}

export const supabase =
  typeof window === "undefined"
    ? createSupabaseClient<AppDatabase>(url, anonKey)
    : createClient();
