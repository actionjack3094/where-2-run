import { redirect } from "next/navigation";
import { finalizeStripeConnectAccount } from "@/lib/actions/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe sends the candidate here after hosted Express onboarding.
 * We persist `stripe_onboarding_complete` from the connected account, then
 * send them back to the Campaign Hub vault.
 */
export default async function StripeConnectReturnPage() {
  const result = await finalizeStripeConnectAccount();
  if (!result.ok) {
    redirect(`/profile?stripe=error`);
  }
  redirect(result.complete ? "/profile?stripe=connected" : "/profile?stripe=refresh");
}
