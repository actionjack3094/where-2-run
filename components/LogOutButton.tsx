"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          void signOutAction();
        });
      }}
      className="h-auto px-0 text-[11px] font-medium uppercase tracking-widest text-zinc-400 hover:bg-transparent hover:text-zinc-200"
    >
      {pending ? "Signing out" : "Log Out"}
    </Button>
  );
}
