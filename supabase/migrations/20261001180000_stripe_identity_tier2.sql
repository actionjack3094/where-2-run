-- Stripe Identity verification unlocks Tier 2 jury rights.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.profiles
  add column if not exists tier2_status text not null default 'unverified',
  add column if not exists stripe_identity_session_id text,
  add column if not exists identity_verified_at timestamptz;

do $$
begin
  alter table public.profiles
    add constraint profiles_tier2_status_check
    check (tier2_status in ('unverified', 'pending', 'verified'));
exception
  when duplicate_object then null;
end
$$;

comment on column public.profiles.tier2_status is
  'Stripe Identity status. verified grants Tier 2 jury rights.';

comment on column public.profiles.stripe_identity_session_id is
  'Latest Stripe Identity VerificationSession id for this constituent.';

comment on column public.profiles.identity_verified_at is
  'When identity.verification_session.verified upgraded this profile.';

create unique index if not exists profiles_stripe_identity_session_id_key
  on public.profiles (stripe_identity_session_id)
  where stripe_identity_session_id is not null;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in (
    'pledge_received',
    'appeal_filed',
    'verdict_overturned',
    'coalition_invite',
    'challenge_received',
    'payout_disbursed',
    'jury_unlocked'
  ));

comment on column public.user_notifications.type is
  'pledge_received, appeal_filed, verdict_overturned, coalition_invite, challenge_received, payout_disbursed, or jury_unlocked.';

notify pgrst, 'reload schema';
