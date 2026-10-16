import Link from "next/link";
import { NAV_FOCUS } from "@/components/nav-links";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] transition-colors lg:text-[11px] lg:tracking-widest",
        NAV_FOCUS,
        active ? "text-amber-800" : "text-stone-600 hover:text-stone-900",
      )}
    >
      {children}
    </Link>
  );
}
