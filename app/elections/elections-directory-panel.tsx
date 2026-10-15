import Link from "next/link";

const DIRECTORY = [
  {
    id: "federal",
    title: "Federal Seats",
    body: "President, Senate, and House seats.",
  },
  {
    id: "state",
    title: "State Legislature",
    body: "State senate, state house, and statewide offices.",
  },
  {
    id: "local",
    title: "Municipal & Local",
    body: "County, city, school, and municipal seats.",
  },
] as const;

export function DirectoryPanel() {
  return (
    <section className="mt-8" aria-labelledby="state-directory-heading">
      <header>
        <h1 id="state-directory-heading" className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          State Directory
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          Pick a map, then a state, to browse the races on it.
        </p>
      </header>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {DIRECTORY.map((tier) => (
          <li key={tier.id}>
            <Link
              href={`/elections/states?tier=${tier.id}`}
              className="flex min-h-44 flex-col justify-between rounded-2xl border border-amber-500/40 bg-white px-5 py-6 transition hover:-translate-y-0.5 hover:border-amber-600"
            >
              <span className="font-display text-2xl font-semibold tracking-tight text-stone-900">{tier.title}</span>
              <span className="mt-6 text-sm leading-6 text-stone-600">{tier.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
