import { redirect } from "next/navigation";
import { createStripeConnectAccount } from "@/lib/actions/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe sends the candidate here if hosted onboarding expires or they
 * bounce. Mint a fresh account link and send them back to Stripe.
 */
export default async function StripeConnectRefreshPage() {
  const result = await createStripeConnectAccount();
  if (!result.ok) {
    redirect("/profile?stripe=error");
  }
  redirect(result.url);
}
