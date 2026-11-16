import type { DirectoryRace } from "@/lib/elections/state-directory";

function canonicalOffice(name: string) {
  return name
    .replace(/\bu\.?\s*s\.?(?=\s|$)/gi, "U.S.")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Collapse "US Senate" and "U.S. Senate" for the same state into one race. */
export function collapseDuplicateOffices(races: DirectoryRace[]) {
  const seen = new Set<string>();
  const unique: DirectoryRace[] = [];
  const ordered = [...races].sort((left, right) => {
    const leftLabel = /u\.s\./i.test(left.officeName) ? 0 : 1;
    const rightLabel = /u\.s\./i.test(right.officeName) ? 0 : 1;
    return leftLabel - rightLabel || left.officeName.localeCompare(right.officeName);
  });
  for (const race of ordered) {
    const key = `${canonicalOffice(race.officeName)}|${race.state}|${race.district ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(race);
  }
  return unique.sort((left, right) => left.officeName.localeCompare(right.officeName));
}
