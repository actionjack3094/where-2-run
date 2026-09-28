import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChannelRoom, type ChannelMessageView, type HouseholdRole } from "@/app/components/ChannelRoom";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Mediation channel",
};

const CHANNEL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolutionSchema = z.object({
  tone: z.enum(["neutral", "collaborative", "heated", "stalled"]),
  friction_points: z.array(z.string()),
  proposed_compromise: z.string(),
  needs_cooldown: z.boolean(),
});

type ProfileJoin = {
  role: string;
  display_name: string;
};

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  profile_id: string;
  profiles: ProfileJoin | ProfileJoin[] | null;
};

type ProfileRow = {
  id: string;
  role: string;
  display_name: string;
};

type ChannelRow = {
  id: string;
  topic: string;
  status: string;
  latest_resolution: unknown;
};

function profileFromJoin(value: MessageRow["profiles"]) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asRole(value: string): HouseholdRole | null {
  if (value === "User A" || value === "User B") return value;
  return null;
}

function toMessage(row: MessageRow): ChannelMessageView {
  const profile = profileFromJoin(row.profiles);
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    role: profile ? asRole(profile.role) : null,
    displayName: profile?.display_name.trim() || "Household member",
  };
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!CHANNEL_ID.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f4f1ec] px-6 text-stone-900">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold tracking-tight">Sign in to open this channel</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Mediation stays inside your household. Sign in as User A or User B to read and send
            messages.
          </p>
        </div>
      </main>
    );
  }

  const [channelResult, profileResult, messagesResult] = await Promise.all([
    supabase
      .from("mediation_channels")
      .select("id, topic, status, latest_resolution")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("id, role, display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("channel_messages")
      .select("id, content, created_at, profile_id, profiles(role, display_name)")
      .eq("channel_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (channelResult.error) throw new Error(channelResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (messagesResult.error) throw new Error(messagesResult.error.message);

  const channel = channelResult.data as ChannelRow | null;
  const profile = profileResult.data as ProfileRow | null;
  if (!channel || !profile) notFound();

  const role = asRole(profile.role);
  if (!role) notFound();

  const parsedResolution = resolutionSchema.safeParse(channel.latest_resolution);
  const messages = ((messagesResult.data ?? []) as MessageRow[]).map(toMessage);

  return (
    <ChannelRoom
      channel={{
        id: channel.id,
        topic: channel.topic,
        status: channel.status,
      }}
      viewer={{
        role,
        displayName: profile.display_name,
      }}
      messages={messages}
      latestResolution={parsedResolution.success ? parsedResolution.data : null}
    />
  );
}
