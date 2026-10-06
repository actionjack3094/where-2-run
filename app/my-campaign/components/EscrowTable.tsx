import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd } from "@/lib/pledges";
import type { EscrowRow } from "@/lib/war-room";

export function EscrowTable({ rows }: { rows: EscrowRow[] }) {
  return (
    <section aria-labelledby="escrow-table-heading" className="mt-12">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-600">
          Conditional vault
        </p>
        <h2
          id="escrow-table-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-stone-900"
        >
          Uncaptured SetupIntents
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
          Cards sitting on this ticket. Alias, amount, and the debate condition
          that has to clear before Stripe captures.
        </p>
      </header>

      <Card className="mt-6 overflow-hidden bg-white">
        <CardHeader className="border-b border-gold/30">
          <CardTitle className="font-display text-lg text-stone-900">
            Escrow ledger
          </CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "The vault is empty."
              : `${rows.length} ${rows.length === 1 ? "authorization" : "authorizations"} pending capture`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm leading-6 text-stone-600">
              No uncaptured SetupIntents are attached to this campaign yet.
            </p>
          ) : (
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gold/20 text-[11px] font-medium uppercase tracking-widest text-stone-600">
                  <th className="px-5 py-3 font-medium">Donor alias</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Debate condition</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gold/10 last:border-b-0"
                  >
                    <td className="px-5 py-4 font-medium text-stone-900">
                      {row.donorAlias}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-amber-800">
                      {formatUsd(row.amount)}
                    </td>
                    <td className="px-5 py-4 leading-6 text-stone-600">
                      {row.debateCondition}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
