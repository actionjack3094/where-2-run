import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/db/supabase-server";

export default async function MyProfilePage() {
  const user = await getServerUser();
  if (!user) {
    redirect("/onboarding");
  }
  redirect(`/profile/${user.id}`);
}
