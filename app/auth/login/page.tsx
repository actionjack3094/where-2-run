"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/db/supabase";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "create-account";

const INPUT_CLASS =
  "h-12 w-full rounded-md border border-gold/40 bg-zinc-950 px-4 text-sm text-parchment outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-gold/60";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signingIn = mode === "sign-in";
  const submitLabel = signingIn ? "Sign In" : "Create Account";

  async function routeAfterAuth(userId: string) {
    const { data, error: profileError } = await supabase
      .from("candidates")
      .select("onboarding_completed")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setBusy(false);
      return;
    }

    if (data?.onboarding_completed) {
      router.push("/feed");
      router.refresh();
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };

    if (signingIn) {
      const { data, error: authError } = await supabase.auth.signInWithPassword(credentials);
      if (authError) {
        setError(authError.message);
        setBusy(false);
        return;
      }

      const userId = data.user?.id ?? data.session?.user.id;
      if (!userId) {
        setError("Sign in did not return a session.");
        setBusy(false);
        return;
      }

      await routeAfterAuth(userId);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp(credentials);
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }

    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError("User already registered");
      setBusy(false);
      return;
    }

    if (!data.session) {
      setNotice("Check your email to confirm your account, then sign in.");
      setBusy(false);
      return;
    }

    const userId = data.user?.id ?? data.session.user.id;
    await routeAfterAuth(userId);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  return (
    <main className="flex min-h-full w-full flex-1 flex-col items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-100">
      <section className="w-full max-w-md rounded-xl border border-gold/40 bg-zinc-900 p-6 shadow-[inset_3px_0_0_0_var(--gold-strong)] sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          Arena access
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-parchment">
          {signingIn ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {signingIn
            ? "Return to the floor with the email on your candidate ticket."
            : "Open a candidate ticket, then file your district and ideology baseline."}
        </p>

        <div
          role="tablist"
          aria-label="Authentication mode"
          className="mt-8 grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={signingIn}
            onClick={() => switchMode("sign-in")}
            className={cn(
              "h-10 rounded-md text-[11px] font-medium uppercase tracking-widest transition-colors",
              signingIn ? "bg-gold/15 text-gold" : "text-zinc-500 hover:text-zinc-200",
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!signingIn}
            onClick={() => switchMode("create-account")}
            className={cn(
              "h-10 rounded-md text-[11px] font-medium uppercase tracking-widest transition-colors",
              !signingIn ? "bg-gold/15 text-gold" : "text-zinc-500 hover:text-zinc-200",
            )}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
              Email
            </span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
              Password
            </span>
            <input
              type="password"
              name="password"
              autoComplete={signingIn ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
              className={INPUT_CLASS}
            />
          </label>
          <Button type="submit" variant="gold" size="full" disabled={busy}>
            {busy ? "Checking ticket…" : submitLabel}
          </Button>
          {error ? (
            <p className="text-sm leading-6 text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className="text-sm leading-6 text-zinc-300">{notice}</p> : null}
        </form>
      </section>
    </main>
  );
}
