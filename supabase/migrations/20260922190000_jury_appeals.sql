-- Civic-gated jury votes on marginal debate scores (confidence 0.60–0.89).
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.jury_appeals (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  voter_id uuid not null references public.users(id) on delete cascade,
  vote_direction boolean not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint jury_appeals_debate_voter_key unique (debate_id, voter_id)
);

create index if not exists jury_appeals_debate_idx
  on public.jury_appeals (debate_id, created_at desc);

comment on table public.jury_appeals is
  'One civic-gated jury vote per constituent on a marginal debate appeal.';

comment on column public.jury_appeals.vote_direction is
  'True validates the argument (pass). False rejects it (fail).';

comment on constraint jury_appeals_debate_voter_key on public.jury_appeals is
  'A constituent may cast only one jury vote per debate.';

alter table public.elections
  add column if not exists ocd_id text;

comment on column public.elections.ocd_id is
  'OCD-ID for the seat. Jury eligibility compares a voter''s verified divisions to this id.';

alter table public.jury_appeals enable row level security;

drop policy if exists jury_appeals_select_public on public.jury_appeals;
create policy jury_appeals_select_public
  on public.jury_appeals
  for select
  to anon, authenticated
  using (true);

drop policy if exists jury_appeals_insert_own on public.jury_appeals;
create policy jury_appeals_insert_own
  on public.jury_appeals
  for insert
  to authenticated
  with check (voter_id = auth.uid());

grant select on public.jury_appeals to anon, authenticated, service_role;
grant insert on public.jury_appeals to authenticated, service_role;

notify pgrst, 'reload schema';
