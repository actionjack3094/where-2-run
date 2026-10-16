import { platformAdmin } from "@/lib/platform/records";

export function excerpt(value: string, max = 220) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export async function primaryLookup(admin: ReturnType<typeof platformAdmin>, ids: string[]) {
  const unique = [...new Set(ids)];
  const map = new Map<string, { office: string; party: string; slug: string }>();
  if (unique.length === 0) return map;
  const result = await admin.from("primaries").select("id, office_name, party, slug").in("id", unique);
  if (result.error) return map;
  for (const row of (result.data ?? []) as {
    id: string;
    office_name: string;
    party: string;
    slug: string;
  }[]) {
    map.set(row.id, { office: row.office_name, party: row.party, slug: row.slug });
  }
  return map;
}
