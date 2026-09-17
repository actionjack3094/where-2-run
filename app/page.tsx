import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-1 flex-col justify-center px-6 py-24">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
        Where 2 Run
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Find the district that can actually elect you.
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-zinc-500 dark:text-zinc-400">
        Six policy questions. A 10-dimensional ideology vector. Cosine similarity against seeded district medians.
      </p>
      <Button asChild size="lg" className="mt-10 w-fit">
        <Link href="/onboarding">Begin the funnel</Link>
      </Button>
    </main>
  );
}
