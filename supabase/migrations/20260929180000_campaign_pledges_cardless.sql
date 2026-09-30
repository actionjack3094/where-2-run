-- One-click conditional pledges. A spectator can lock in funding for a
-- candidate without vaulting a card first; the card is collected later, before
-- capture. Capture already skips pledges that have no payment method.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.campaign_pledges
  alter column stripe_customer_id drop not null;

comment on column public.campaign_pledges.stripe_customer_id is
  'Null for one-click pledges that have not vaulted a card yet.';

-- One open card-less pledge per donor, candidate and race, so a double click
-- cannot stack duplicates. Vaulted (Stripe) pledges are unaffected.
create unique index if not exists campaign_pledges_cardless_open_idx
  on public.campaign_pledges (donor_id, candidate_id, election_id)
  where stripe_setup_intent_id is null and status = 'pending';

notify pgrst, 'reload schema';
