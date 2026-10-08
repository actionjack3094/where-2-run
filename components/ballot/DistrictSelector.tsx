import Link from "next/link";
import { US_STATES } from "@/lib/platform/states";

export function DistrictSelector({ selected }: { selected: string | null }) {
  return (
    <form
      action="/ballot"
      method="get"
      className="mt-8 rounded-xl border border-gold bg-white px-6 py-6"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-800">
        Address unverified
      </p>
      <p className="mt-3 font-display text-2xl text-stone-900">
        Choose a state to preview its ballot.
      </p>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        My Ballot stays empty until a residential address maps to a district. A state preview
        is only a stand-in.
      </p>
      <label className="mt-5 flex flex-col gap-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-widest text-stone-600">State</span>
        <select
          name="state"
          defaultValue={selected ?? ""}
          className="h-11 rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm text-stone-900 outline-none focus:border-amber-700"
        >
          <option value="">Select a state</option>
          {US_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="rounded-md bg-gold-strong px-4 py-2 text-xs font-semibold uppercase tracking-widest text-stone-900"
        >
          Show ballot
        </button>
        <Link href="/onboarding/address" className="text-xs uppercase tracking-widest text-amber-800">
          Verify your address
        </Link>
      </div>
    </form>
  );
}
