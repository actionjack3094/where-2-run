-- Appeal filings: a verified constituent contests a completed debate within
-- 24 hours. The original jury_appeals table stored civic-gated votes
-- (voter_id, vote_direction). This adds appeal-filing columns and a verdicts
-- table for peer jurors. Legacy vote rows keep voter_id/vote_direction and a
-- null status so the old quorum tally can ignore filings.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.jury_appeals
  add column if not exists appellant_id uuid references public.users(id) on delete cascade,
  add column if not exists reason text,
  add column if not exists status text;

alter table public.jury_appeals
  alter column voter_id drop not null,
  alter column vote_direction drop not null;

alter table public.jury_appeals
  drop constraint if exists jury_appeals_status_check;
alter table public.jury_appeals
  add constraint jury_appeals_status_check
  check (status is null or status in ('pending', 'upheld', 'overturned', 'dismissed'));

create unique index if not exists jury_appeals_debate_appellant_key
  on public.jury_appeals (debate_id, appellant_id)
  where appellant_id is not null;

comment on column public.jury_appeals.appellant_id is
  'Verified constituent who filed this contest of the debate outcome.';
comment on column public.jury_appeals.reason is
  'Appellant''s written grounds for contesting the outcome.';
comment on column public.jury_appeals.status is
  'pending until the jury closes the appeal. Null on legacy civic-gated votes.';

drop policy if exists jury_appeals_insert_own on public.jury_appeals;
create policy jury_appeals_insert_own
  on public.jury_appeals
  for insert
  to authenticated
  with check (coalesce(appellant_id, voter_id) = auth.uid());

create table if not exists public.jury_verdicts (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid not null references public.jury_appeals(id) on delete cascade,
  juror_id uuid not null references public.users(id) on delete cascade,
  overturned boolean not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint jury_verdicts_appeal_juror_key unique (appeal_id, juror_id)
);

create index if not exists jury_verdicts_appeal_idx
  on public.jury_verdicts (appeal_id, created_at desc);

comment on table public.jury_verdicts is
  'One peer-juror decision per appeal. True votes to overturn the debate outcome.';

comment on column public.jury_verdicts.overturned is
  'True overturns the contested outcome. False upholds it.';

comment on constraint jury_verdicts_appeal_juror_key on public.jury_verdicts is
  'A constituent may cast only one verdict per appeal.';

alter table public.jury_verdicts enable row level security;

drop policy if exists jury_verdicts_select_public on public.jury_verdicts;
create policy jury_verdicts_select_public
  on public.jury_verdicts
  for select
  to anon, authenticated
  using (true);

drop policy if exists jury_verdicts_insert_own on public.jury_verdicts;
create policy jury_verdicts_insert_own
  on public.jury_verdicts
  for insert
  to authenticated
  with check (juror_id = auth.uid());

grant select on public.jury_verdicts to anon, authenticated, service_role;
grant insert on public.jury_verdicts to authenticated, service_role;

notify pgrst, 'reload schema';
