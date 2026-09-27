"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const marketing = pathname === "/";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {marketing ? null : <SiteNav />}
      {children}
      {marketing ? null : <SiteFooter />}
    </div>
  );
}
