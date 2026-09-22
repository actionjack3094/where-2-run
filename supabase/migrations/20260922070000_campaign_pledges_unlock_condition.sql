-- Trigger that must fire before a vaulted SetupIntent is captured off-session.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.campaign_pledges
  add column if not exists unlock_condition text;

comment on column public.campaign_pledges.unlock_condition is
  'Spectator-selected trigger. Capture waits until this condition is met.';

notify pgrst, 'reload schema';
