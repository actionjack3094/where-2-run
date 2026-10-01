-- Funded Checkout pledges. The webhook inserts a row only after Stripe
-- reports checkout.session.completed, and stripe_session_id makes that insert
-- idempotent across retries.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.campaign_pledges
  add column if not exists stripe_session_id text;

comment on column public.campaign_pledges.stripe_session_id is
  'Stripe Checkout Session that funded this pledge. Unique so webhook retries cannot insert a second row.';

create unique index if not exists campaign_pledges_stripe_session_idx
  on public.campaign_pledges (stripe_session_id)
  where stripe_session_id is not null;

-- One-click cardless pledges stay unique. Checkout rows carry a session id
-- and are excluded, so each successful payment is recorded on its own.
drop index if exists public.campaign_pledges_cardless_open_idx;
create unique index campaign_pledges_cardless_open_idx
  on public.campaign_pledges (donor_id, candidate_id, election_id)
  where stripe_setup_intent_id is null
    and stripe_session_id is null
    and status = 'pending';

notify pgrst, 'reload schema';
