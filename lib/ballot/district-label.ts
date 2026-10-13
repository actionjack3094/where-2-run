/** Congressional label such as TX-10. */
export function formatDistrictLabel(state: string | null | undefined, district: string | null | undefined) {
  const raw = (district ?? "").trim();
  const coded = raw.toUpperCase().match(/^([A-Z]{2})-(\d+)$/);
  if (coded) return `${coded[1]}-${Number(coded[2])}`;

  const st = (state ?? "").trim().toUpperCase();
  const number = raw.replace(/^district\s+/i, "").replace(/^0+/, "");
  if (st && number && /^\d+$/.test(number)) return `${st}-${Number(number)}`;
  if (st) return st;
  return number || null;
}

/** First congressional division on a home OCD list, as TX-10. */
export function districtLabelFromOcd(ids: string[]) {
  for (const id of ids) {
    const match = id.match(/state:([a-z]{2})\/cd:(\d+)/i);
    if (match) return `${match[1].toUpperCase()}-${Number(match[2])}`;
  }
  return null;
}
