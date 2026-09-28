-- Dual-user household ledger.
-- Each household has one User A and one User B. Mediation stays inside that pair.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  role text not null,
  display_name text not null,
  constraint profiles_role_check check (role in ('User A', 'User B')),
  constraint profiles_household_role_key unique (household_id, role)
);

create table public.mediation_channels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  topic text not null,
  status text not null default 'open',
  constraint mediation_channels_status_check check (status in ('open', 'resolved'))
);

create table public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.mediation_channels (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  ai_analysis_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint channel_messages_ai_analysis_tags_array_check
    check (jsonb_typeof(ai_analysis_tags) = 'array')
);

create index profiles_household_id_idx
  on public.profiles (household_id);

create index mediation_channels_household_id_idx
  on public.mediation_channels (household_id, status);

create index channel_messages_channel_id_idx
  on public.channel_messages (channel_id, created_at);

comment on table public.households is
  'A shared home for one User A and one User B.';

comment on column public.profiles.role is
  'User A or User B. One of each per household.';

comment on column public.mediation_channels.status is
  'open while the pair is still in the channel, resolved once it is closed.';

comment on column public.channel_messages.ai_analysis_tags is
  'Structured tags from generateObject. Stored as a JSON array.';

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.mediation_channels enable row level security;
alter table public.channel_messages enable row level security;

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.profiles
  where id = auth.uid()
$$;

revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated;

create policy households_select_member
  on public.households
  for select
  to authenticated
  using (id = public.current_household_id());

create policy profiles_select_household
  on public.profiles
  for select
  to authenticated
  using (household_id = public.current_household_id());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and household_id = public.current_household_id());

create policy mediation_channels_member
  on public.mediation_channels
  for all
  to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy channel_messages_member
  on public.channel_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mediation_channels as channel
      where channel.id = channel_messages.channel_id
        and channel.household_id = public.current_household_id()
    )
  );

create policy channel_messages_insert_own
  on public.channel_messages
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.mediation_channels as channel
      where channel.id = channel_messages.channel_id
        and channel.household_id = public.current_household_id()
    )
  );

grant select on public.households to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.mediation_channels to authenticated;
grant select, insert on public.channel_messages to authenticated;
