"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/arena/display";
import { createAdminClient } from "@/lib/db/supabase-admin";
import { getServerUser } from "@/lib/db/supabase-server";

export async function assignVoterDistrict(districtId: string) {
  const id = districtId.trim();
  if (!isUuid(id)) {
    throw new Error("Select a district from the list.");
  }

  const user = await getServerUser();
  if (!user) {
    throw new Error("Sign in to verify your district.");
  }

  const admin = createAdminClient();
  const { data: district, error: districtError } = await admin
    .from("districts")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (districtError) throw new Error(districtError.message);
  if (!district) throw new Error("That district is not available.");

  const { data: existing, error: readError } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!existing) {
    const username = `voter-${user.id.replace(/-/g, "").slice(0, 8)}`;
    const { error: insertError } = await admin.from("users").insert({
      id: user.id,
      username,
      target_district_id: id,
    });
    if (insertError && insertError.code !== "23505") {
      throw new Error(insertError.message);
    }
  }

  const { error: userError } = await admin
    .from("users")
    .update({
      target_district_id: id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (userError) throw new Error(userError.message);

  const verifiedAt = new Date().toISOString();
  const { data: verified, error: profileError } = await admin
    .from("profiles")
    .update({
      verification_tier: "tier2",
      updated_at: verifiedAt,
    })
    .eq("id", user.id)
    .select("id");

  if (profileError) throw new Error(profileError.message);

  if (!verified?.length) {
    const { error: insertProfileError } = await admin.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
      verification_tier: "tier2",
      updated_at: verifiedAt,
    });
    if (insertProfileError && insertProfileError.code !== "23505") {
      throw new Error(insertProfileError.message);
    }
  }

  revalidatePath("/", "layout");
  redirect("/onboarding/stance");
}
