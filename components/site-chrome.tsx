"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { Navbar } from "@/components/Navbar";
import type { NavIdentity } from "@/lib/actions/profile";

export function SiteChrome({
  identity,
  children,
}: {
  identity: NavIdentity | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const marketing = pathname === "/";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {marketing ? null : <Navbar identity={identity} />}
      {children}
      {marketing ? null : <SiteFooter />}
    </div>
  );
}
