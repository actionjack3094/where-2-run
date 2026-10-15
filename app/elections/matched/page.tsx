import { redirect } from "next/navigation";

export default async function MatchedElectionsPage(props: {
  searchParams: Promise<{ scope?: string; level?: string; seats?: string }>;
}) {
  const params = await props.searchParams;
  const query = new URLSearchParams();
  if (params.scope) query.set("scope", params.scope);
  if (params.level) query.set("level", params.level);
  if (params.seats) query.set("seats", params.seats);
  const suffix = query.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}
