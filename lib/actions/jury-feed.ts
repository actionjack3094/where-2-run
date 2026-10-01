"use server";

import { getPendingAppealsForUser } from "@/lib/queries/jury-feed";

export async function countPendingJuryDuty() {
  return (await getPendingAppealsForUser()).length;
}
