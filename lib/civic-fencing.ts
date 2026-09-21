export function isMissingCivicColumn(
  error: { message?: string; code?: string } | null,
) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /ocd_identifiers|tier_2_verified/i.test(message)
  );
}

export function normalizeOcdId(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function extractOcdIdentifiers(
  divisions: Record<string, unknown> | null | undefined,
): string[] {
  if (!divisions || typeof divisions !== "object" || Array.isArray(divisions)) {
    return [];
  }

  const unique = new Set<string>();
  for (const key of Object.keys(divisions)) {
    const id = key.trim();
    if (!id) continue;
    unique.add(id);
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

export function checkLocalEligibility(
  userOcdArray: readonly string[] | null | undefined,
  debateOcdId: string | null | undefined,
): boolean {
  const target = normalizeOcdId(debateOcdId);
  if (!target) return false;
  if (!Array.isArray(userOcdArray) || userOcdArray.length === 0) return false;
  return userOcdArray.some((id) => normalizeOcdId(id) === target);
}
