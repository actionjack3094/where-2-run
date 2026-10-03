import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvatarUpload } from "@/app/profile/settings/avatar-upload";
import { isMissingSchema } from "@/lib/db/schema-errors";
import { getServerUser } from "@/lib/db/supabase-server";
import { displayName, loadProfile, platformAdmin } from "@/lib/platform/records";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile photo · WHERE 2 RUN",
  description: "Upload the photo shown on your ballot, debates, and public profile.",
};

export default async function ProfileSettingsPage() {
  const user = await getServerUser().catch(() => null);
  if (!user) redirect("/auth/login?next=%2Fprofile%2Fsettings");

  let name = "Contender";
  let avatarUrl: string | null = null;
  let setup: string | null = null;
  try {
    const profile = await loadProfile(platformAdmin(), user.id);
    if (profile) {
      name = displayName(profile);
      avatarUrl = profile.avatar_url;
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load your profile.";
    setup = isMissingSchema({ message }) ? "Apply the avatar migration, then reload." : message;
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10 pb-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Profile</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
            Profile photo
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This photo appears on My Ballot, Debates, primary leaderboards, and your public profile.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link
              href="/profile/settings/platform"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Campaign platform
            </Link>
            <Link
              href="/profile/settings/volunteers"
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Volunteers
            </Link>
            <Link
              href={`/profile/${user.id}`}
              className="inline-flex text-[11px] font-medium uppercase tracking-[0.2em] text-gold hover:text-parchment"
            >
              Public profile
            </Link>
          </div>
        </header>

        {setup ? <p className="mt-8 text-sm leading-6 text-zinc-300">{setup}</p> : null}
        {setup ? null : <AvatarUpload userId={user.id} name={name} avatarUrl={avatarUrl} />}
      </div>
    </main>
  );
}
