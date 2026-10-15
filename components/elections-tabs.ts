export function electionsTabs(current: "matched" | "ballot" | "directory") {
  return [
    { href: "/", label: "Matched Primaries", active: current === "matched" },
    { href: "/?tab=ballot", label: "My Voter Ballot", active: current === "ballot" },
    { href: "/?tab=directory", label: "State Directory", active: current === "directory" },
  ];
}
