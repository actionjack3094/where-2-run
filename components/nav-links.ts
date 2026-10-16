export const NAV_LINKS = [
  {
    href: "/",
    label: "Elections",
    match: (path: string) =>
      path === "/" ||
      path.startsWith("/elections") ||
      path.startsWith("/ballot") ||
      path.startsWith("/primaries"),
  },
  {
    href: "/debates",
    label: "Debates",
    match: (path: string) => path.startsWith("/debates") || path.startsWith("/discover"),
  },
  {
    href: "/soapbox",
    label: "Soapbox",
    match: (path: string) => path.startsWith("/soapbox"),
  },
  {
    href: "/townhall",
    label: "Townhall",
    match: (path: string) => path.startsWith("/townhall"),
  },
] as const;

export const NAV_FOCUS =
  "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2";
