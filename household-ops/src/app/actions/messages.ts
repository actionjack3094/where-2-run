"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const CHANNEL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Post a message to a household channel as the signed-in profile. */
export async function sendMessage(channelId: string, content: string) {
  const id = channelId.trim();
  if (!CHANNEL_ID.test(id)) {
    throw new Error("A mediation channel is required.");
  }

  const text = content.trim();
  if (!text) {
    throw new Error("Write a message before sending.");
  }
  if (text.length > 4000) {
    throw new Error("Keep messages under 4000 characters.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to send a message.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Your household profile is missing.");

  const { data: channel, error: channelError } = await supabase
    .from("mediation_channels")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (channelError) throw new Error(channelError.message);
  if (!channel) throw new Error("This channel is not in your household.");

  const { error } = await supabase.from("channel_messages").insert({
    channel_id: id,
    profile_id: profile.id,
    content: text,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/channels/${id}`);
}
