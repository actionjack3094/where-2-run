-- Candidate alert when a released escrow payout is transferred to their bank.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

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
    'payout_disbursed'
  ));

comment on column public.user_notifications.type is
  'pledge_received, appeal_filed, verdict_overturned, coalition_invite, challenge_received, or payout_disbursed.';

notify pgrst, 'reload schema';
