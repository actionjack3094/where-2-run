import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-100">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Arena access
          </p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
