-- Civic moderation: ban bit on profiles, and a flag queue only admins can read.

alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_banned is
  'When true, the account cannot open, accept, or rebut an arena debate.';
comment on column public.profiles.is_admin is
  'When true, the account may read and update flagged_content.';

create table if not exists public.flagged_content (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  debate_id uuid not null references public.arena_debates (id) on delete cascade,
  offender_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint flagged_content_status_check
    check (status in ('pending', 'dismissed', 'banned')),
  constraint flagged_content_reason_check
    check (char_length(trim(reason)) between 1 and 1000),
  constraint flagged_content_not_self
    check (reporter_id <> offender_id)
);

create index if not exists flagged_content_status_created_idx
  on public.flagged_content (status, created_at desc);

create index if not exists flagged_content_offender_idx
  on public.flagged_content (offender_id, status);

comment on table public.flagged_content is
  'User reports of an arena debate. Reporters insert. Admins read and resolve.';

alter table public.flagged_content enable row level security;

drop policy if exists flagged_content_insert_own on public.flagged_content;
create policy flagged_content_insert_own
  on public.flagged_content
  for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and offender_id <> auth.uid()
    and status = 'pending'
  );

drop policy if exists flagged_content_admin_select on public.flagged_content;
create policy flagged_content_admin_select
  on public.flagged_content
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

drop policy if exists flagged_content_admin_update on public.flagged_content;
create policy flagged_content_admin_update
  on public.flagged_content
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

grant insert on public.flagged_content to authenticated;
grant select, update on public.flagged_content to authenticated;
grant select, insert, update, delete on public.flagged_content to service_role;

notify pgrst, 'reload schema';
