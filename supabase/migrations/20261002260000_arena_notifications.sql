-- Arena loop alerts. Separate from legacy public.user_notifications.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  debate_id uuid not null references public.arena_debates (id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint notifications_type_check
    check (type in ('challenge_accepted', 'debate_concluded', 'seat_expiring_soon')),
  constraint notifications_user_type_debate_key unique (user_id, type, debate_id)
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where is_read = false;

comment on table public.notifications is
  'Arena debate alerts. Scores and judge text are never stored here.';

alter table public.notifications enable row level security;

drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Update own notifications" on public.notifications;
create policy "Update own notifications"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter table public.notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
