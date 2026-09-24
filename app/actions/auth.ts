"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/db/supabase-server";

export async function signOutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
