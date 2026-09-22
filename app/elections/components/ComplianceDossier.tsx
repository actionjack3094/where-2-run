import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Election, FilingRequirements } from "@/types/database.types";

function asRequirements(value: Election["filing_requirements"]): FilingRequirements {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FilingRequirements;
  }
  return {};
}

function formatLongDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function ComplianceDossier({ election }: { election: Election }) {
  const requirements = asRequirements(election.filing_requirements);
  const treasurer = requirements.treasurer ?? {};
  const steps = treasurer.steps?.filter(Boolean) ?? [];
  const ballotAccess = requirements.ballot_access?.filter(Boolean) ?? [];
  const filingDeadline = formatLongDate(requirements.filing_deadline);
  const residencyDeadline = formatLongDate(requirements.residency_deadline);

  return (
    <section aria-labelledby="compliance-dossier-heading">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          Ballot access
        </p>
        <h2
          id="compliance-dossier-heading"
          className="mt-3 font-display text-2xl font-semibold tracking-tight text-parchment"
        >
          Compliance dossier
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Incumbent, filing calendar, and the treasurer appointment that has to
          land before this campaign can raise or spend.
        </p>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              Incumbent
            </p>
            <CardTitle className="font-display text-xl text-parchment">
              {election.incumbent_name?.trim() || "Open or unpublished"}
            </CardTitle>
            <CardDescription>
              {requirements.jurisdiction ?? election.office_name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-zinc-400">
            <p>
              {election.incumbent_name
                ? `${election.incumbent_name} currently holds ${election.office_name}. Challengers still have to clear the same ballot-access tests.`
                : "No incumbent is on file for this cycle. Treat the seat as open until the clerk publishes the qualified list."}
            </p>
            {requirements.residency ? <p>{requirements.residency}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              Filing calendar
            </p>
            <CardTitle className="font-display text-xl text-parchment">
              {filingDeadline ?? "Deadline unpublished"}
            </CardTitle>
            <CardDescription>
              Application for a place on the ballot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-zinc-400">
            <p>
              <span className="text-parchment">Residency deadline: </span>
              {residencyDeadline ?? "See clerk records"}
            </p>
            {requirements.filing_fee ? (
              <p>
                <span className="text-parchment">Fee / petition: </span>
                {requirements.filing_fee}
              </p>
            ) : null}
            {requirements.petition_signatures != null ? (
              <p>
                <span className="text-parchment">Petition floor: </span>
                {requirements.petition_signatures} valid signatures
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-[11px] font-medium uppercase tracking-widest text-gold">
              Treasurer appointment
            </p>
            <CardTitle className="font-display text-xl text-parchment">
              {treasurer.form ?? "Campaign treasurer"}
            </CardTitle>
            <CardDescription>
              {treasurer.office ?? "File before accepting contributions"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-zinc-400">
            <p>
              {treasurer.notes ??
                "Appoint a campaign treasurer and file the form with the ethics office before the campaign accepts money or makes expenditures."}
            </p>
          </CardContent>
        </Card>
      </div>

      {ballotAccess.length > 0 ? (
        <div className="mt-6 rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Ballot access requirements
          </h3>
          <ol className="mt-4 space-y-3">
            {ballotAccess.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-zinc-300">
                <span className="font-display text-sm font-semibold tabular-nums text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="mt-4 rounded-xl border border-gold/40 bg-zinc-900 px-5 py-5">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-gold">
            Formal campaign treasurer appointment
          </h3>
          <ol className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6 text-zinc-300">
                <span className="font-display text-sm font-semibold tabular-nums text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
