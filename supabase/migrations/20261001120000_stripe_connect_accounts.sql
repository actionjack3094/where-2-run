-- Stripe Connect Express accounts for campaign escrow disbursements.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false;

comment on column public.profiles.stripe_account_id is
  'Stripe Connect Express account id for escrow transfers to this candidate.';

comment on column public.profiles.stripe_onboarding_complete is
  'True after Stripe hosted onboarding reports details_submitted.';

create unique index if not exists profiles_stripe_account_id_key
  on public.profiles (stripe_account_id)
  where stripe_account_id is not null;

notify pgrst, 'reload schema';
