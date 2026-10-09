-- Constituent Agenda Queue: keep the prompt tables, and install the
-- upvote counter under the name update_prompt_upvote_count.
-- Tables and policies were introduced in 20261003070000_constituent_agenda.sql.
-- This migration is idempotent so a database that already applied that file
-- only swaps the trigger.

create table if not exists public.community_prompts (
  id uuid primary key default gen_random_uuid(),
  primary_id uuid not null references public.primaries (id) on delete cascade,
  voter_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  content text not null,
  upvote_count integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint community_prompts_title_check check (char_length(btrim(title)) between 1 and 100),
  constraint community_prompts_content_check check (char_length(btrim(content)) between 1 and 500),
  constraint community_prompts_upvote_count_check check (upvote_count >= 0)
);

create index if not exists community_prompts_primary_votes_idx
  on public.community_prompts (primary_id, upvote_count desc, created_at asc);

create table if not exists public.prompt_upvotes (
  prompt_id uuid not null references public.community_prompts (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (prompt_id, voter_id)
);

create index if not exists prompt_upvotes_voter_idx
  on public.prompt_upvotes (voter_id);

alter table public.debate_prompts
  add column if not exists source_prompt_id uuid references public.community_prompts (id) on delete set null;

alter table public.community_prompts enable row level security;
alter table public.prompt_upvotes enable row level security;

drop policy if exists community_prompts_public_read on public.community_prompts;
create policy community_prompts_public_read
  on public.community_prompts
  for select
  to anon, authenticated
  using (true);

drop policy if exists community_prompts_insert_verified on public.community_prompts;
create policy community_prompts_insert_verified
  on public.community_prompts
  for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_verified = true
    )
  );

drop policy if exists prompt_upvotes_public_read on public.prompt_upvotes;
create policy prompt_upvotes_public_read
  on public.prompt_upvotes
  for select
  to anon, authenticated
  using (true);

drop policy if exists prompt_upvotes_insert_verified on public.prompt_upvotes;
create policy prompt_upvotes_insert_verified
  on public.prompt_upvotes
  for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_verified = true
    )
  );

drop policy if exists prompt_upvotes_delete_own on public.prompt_upvotes;
create policy prompt_upvotes_delete_own
  on public.prompt_upvotes
  for delete
  to authenticated
  using (voter_id = auth.uid());

grant select on public.community_prompts, public.prompt_upvotes to anon, authenticated;
grant insert on public.community_prompts, public.prompt_upvotes to authenticated;
grant delete on public.prompt_upvotes to authenticated;
grant select, insert, update, delete on public.community_prompts, public.prompt_upvotes to service_role;

create or replace function public.update_prompt_upvote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_prompts
    set upvote_count = upvote_count + 1
    where id = new.prompt_id;
    return new;
  end if;

  update public.community_prompts
  set upvote_count = greatest(upvote_count - 1, 0)
  where id = old.prompt_id;
  return old;
end;
$$;

drop trigger if exists prompt_upvotes_sync_count on public.prompt_upvotes;
drop trigger if exists update_prompt_upvote_count on public.prompt_upvotes;
create trigger update_prompt_upvote_count
  after insert or delete on public.prompt_upvotes
  for each row
  execute function public.update_prompt_upvote_count();

drop function if exists public.sync_prompt_upvote_count();

revoke all on function public.update_prompt_upvote_count() from public, anon, authenticated;

notify pgrst, 'reload schema';
