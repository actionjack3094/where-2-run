-- Public comments on debates, with a nullable AI stance score for later grading.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default timezone('utc'::text, now()),
  ai_stance_score numeric
);

create index if not exists comments_debate_created_at_idx
  on public.comments (debate_id, created_at);

comment on table public.comments is
  'Public spectator comments on a debate. ai_stance_score is reserved for future grading.';

comment on column public.comments.ai_stance_score is
  'Nullable AI stance grade. Unused at insert time.';

alter table public.comments enable row level security;

drop policy if exists comments_select_public on public.comments;
create policy comments_select_public
  on public.comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
  on public.comments
  for insert
  to authenticated
  with check (author_id = auth.uid());

grant select on public.comments to anon, authenticated, service_role;
grant insert on public.comments to authenticated, service_role;

notify pgrst, 'reload schema';
