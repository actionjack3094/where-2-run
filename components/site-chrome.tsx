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
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Navbar identity={identity} />
      {children}
      <SiteFooter />
    </div>
  );
}
