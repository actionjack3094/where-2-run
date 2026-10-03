-- Campaign platforms for Declared Candidates, and volunteer signups for Frontrunners.

create table if not exists public.candidate_platforms (
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid not null references public.primaries (id) on delete cascade,
  manifesto text not null,
  key_policies jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, primary_id),
  constraint candidate_platforms_manifesto_length
    check (char_length(btrim(manifesto)) between 20 and 4000),
  constraint candidate_platforms_key_policies_check
    check (
      jsonb_typeof(key_policies) = 'array'
      and jsonb_array_length(key_policies) between 1 and 3
      and not exists (
        select 1
        from jsonb_array_elements(key_policies) as item
        where jsonb_typeof(item) <> 'string'
          or char_length(btrim(item #>> '{}')) = 0
          or char_length(item #>> '{}') > 180
      )
    )
);

comment on table public.candidate_platforms is
  'Public manifesto and up to three policy pillars for one primary. Writes belong to the profile owner.';

create table if not exists public.volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  campaign_user_id uuid not null references public.profiles (id) on delete cascade,
  volunteer_user_id uuid not null references public.profiles (id) on delete cascade,
  primary_id uuid not null references public.primaries (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint volunteer_signups_status_check
    check (status in ('pending', 'accepted', 'declined')),
  constraint volunteer_signups_not_self
    check (campaign_user_id <> volunteer_user_id),
  constraint volunteer_signups_once
    unique (campaign_user_id, volunteer_user_id, primary_id)
);

comment on table public.volunteer_signups is
  'A viewer asking to volunteer for a Frontrunner in one primary.';

alter table public.candidate_platforms enable row level security;
alter table public.volunteer_signups enable row level security;

drop policy if exists "Public read campaign platforms" on public.candidate_platforms;
create policy "Public read campaign platforms"
  on public.candidate_platforms
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Owner inserts campaign platform" on public.candidate_platforms;
create policy "Owner inserts campaign platform"
  on public.candidate_platforms
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Owner updates campaign platform" on public.candidate_platforms;
create policy "Owner updates campaign platform"
  on public.candidate_platforms
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Owner deletes campaign platform" on public.candidate_platforms;
create policy "Owner deletes campaign platform"
  on public.candidate_platforms
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Read own volunteer signups" on public.volunteer_signups;
create policy "Read own volunteer signups"
  on public.volunteer_signups
  for select
  to authenticated
  using (campaign_user_id = auth.uid() or volunteer_user_id = auth.uid());

drop policy if exists "Volunteer inserts own signup" on public.volunteer_signups;
create policy "Volunteer inserts own signup"
  on public.volunteer_signups
  for insert
  to authenticated
  with check (volunteer_user_id = auth.uid());

revoke all on public.candidate_platforms from public, anon, authenticated;
grant select on public.candidate_platforms to anon, authenticated;
grant insert, update, delete on public.candidate_platforms to authenticated;
grant select, insert, update, delete on public.candidate_platforms to service_role;

revoke all on public.volunteer_signups from public, anon, authenticated;
grant select, insert on public.volunteer_signups to authenticated;
grant select, insert, update, delete on public.volunteer_signups to service_role;
