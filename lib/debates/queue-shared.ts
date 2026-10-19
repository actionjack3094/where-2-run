import { formatDistrictLabel } from "@/lib/ballot/district-label";
import { compactCongressionalLabel } from "@/lib/campaign/targets";
import { platformAdmin } from "@/lib/platform/records";

export function excerpt(value: string, max = 220) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function primarySeatLabel(row: {
  office_name: string;
  state: string | null;
  district: string | null;
  ocd_id: string | null;
}) {
  const compact = compactCongressionalLabel(row.ocd_id);
  if (compact) return compact;
  const office = row.office_name.trim() || "Primary";
  const seat = formatDistrictLabel(row.state, row.district);
  if (!seat) return office;
  if (/\bhouse\b/i.test(office) && !/state\s+house/i.test(office)) return `U.S. House ${seat}`;
  return `${office} ${seat}`;
}

export type PrimaryBrief = {
  office: string;
  party: string;
  slug: string;
};

export async function primaryLookup(admin: ReturnType<typeof platformAdmin>, ids: string[]) {
  const unique = [...new Set(ids)];
  const map = new Map<string, PrimaryBrief>();
  if (unique.length === 0) return map;
  const result = await admin
    .from("primaries")
    .select("id, office_name, party, slug, state, district, ocd_id")
    .in("id", unique);
  if (result.error) return map;
  for (const row of (result.data ?? []) as {
    id: string;
    office_name: string;
    party: string;
    slug: string;
    state: string | null;
    district: string | null;
    ocd_id: string | null;
  }[]) {
    map.set(row.id, { office: primarySeatLabel(row), party: row.party, slug: row.slug });
  }
  return map;
}
