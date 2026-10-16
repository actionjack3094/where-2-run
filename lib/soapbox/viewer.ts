import { districtLabelFromOcd } from "@/lib/ballot/district-label";
import { compactCongressionalLabel } from "@/lib/campaign/targets";
import { getServerUser } from "@/lib/db/supabase-server";
import { normalizeZip } from "@/lib/electability";
import { displayName, loadHomeOcdIds, loadProfile, platformAdmin } from "@/lib/platform/records";
import type { SoapboxViewer } from "@/components/soapbox/types";

const FALLBACK_DISTRICT = "U.S. House TX-10";

function houseLabel(ids: string[]) {
  for (const id of ids) {
    const compact = compactCongressionalLabel(id);
    if (compact) return compact;
  }
  const coded = districtLabelFromOcd(ids);
  return coded ? `U.S. House ${coded}` : null;
}

export async function loadSoapboxViewer(): Promise<SoapboxViewer> {
  const guest: SoapboxViewer = { name: "You", district: FALLBACK_DISTRICT, zip: "" };
  try {
    const user = await getServerUser();
    if (!user) return guest;

    const admin = platformAdmin();
    const [profile, home, zipRow, residency] = await Promise.all([
      loadProfile(admin, user.id).catch(() => null),
      loadHomeOcdIds(admin, user.id).catch(() => [] as string[]),
      admin.from("profiles").select("voting_zip_code").eq("id", user.id).maybeSingle(),
      admin.from("users").select("residency_zip").eq("id", user.id).maybeSingle(),
    ]);

    const votingZip =
      zipRow.error || !zipRow.data
        ? ""
        : normalizeZip((zipRow.data as { voting_zip_code?: string | null }).voting_zip_code);
    const homeZip =
      residency.error || !residency.data
        ? ""
        : normalizeZip((residency.data as { residency_zip?: string | null }).residency_zip);

    return {
      name: profile ? displayName(profile) : "You",
      district: houseLabel(home) ?? FALLBACK_DISTRICT,
      zip: votingZip.length === 5 ? votingZip : homeZip,
    };
  } catch {
    return guest;
  }
}
