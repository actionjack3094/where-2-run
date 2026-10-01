-- In-app inbox: pledges, debate challenges, jury appeals, and coalition invites.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  reference_id uuid,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint user_notifications_type_check
    check (type in (
      'pledge_received',
      'appeal_filed',
      'verdict_overturned',
      'coalition_invite',
      'challenge_received'
    ))
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id)
  where read_at is null;

comment on table public.user_notifications is
  'Per-user inbox rows for pledges, appeals, verdicts, coalition invites, and challenges.';

comment on column public.user_notifications.user_id is
  'Recipient. RLS limits select/update to this user.';

comment on column public.user_notifications.type is
  'pledge_received, appeal_filed, verdict_overturned, coalition_invite, or challenge_received.';

comment on column public.user_notifications.reference_id is
  'UUID of the underlying pledge, appeal, coalition, or debate.';

comment on column public.user_notifications.read_at is
  'Set when the recipient opens the alert. Null means unread.';

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
  on public.user_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own
  on public.user_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.user_notifications to authenticated;
grant select, insert, update, delete on public.user_notifications to service_role;

notify pgrst, 'reload schema';
