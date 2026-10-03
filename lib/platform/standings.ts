import { isMissingSchema } from "@/lib/db/schema-errors";
import { loadStanding, type PlatformAdmin } from "@/lib/platform/records";

/** Set debates_logged to the finished-match count after a debate concludes. */
export async function incrementDebatesLogged(
  admin: PlatformAdmin,
  primaryId: string,
  userIds: string[],
) {
  for (const userId of userIds) {
    if (!userId) continue;
    const standing = await loadStanding(admin, userId, primaryId);
    if (!standing) continue;
    const logged = Math.max(standing.debates_logged ?? 0, standing.debates_count ?? 0);
    if ((standing.debates_logged ?? 0) === logged) continue;
    const { error } = await admin
      .from("primary_standings")
      .update({ debates_logged: logged, updated_at: new Date().toISOString() })
      .eq("id", standing.id);
    if (error && !isMissingSchema(error)) throw new Error(error.message);
  }
}
