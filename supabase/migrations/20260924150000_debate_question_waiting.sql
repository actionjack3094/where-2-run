-- Candidate-mode matchmaking. A waiting debate is an open floor on one
-- election question inside one district, with candidate_b still empty.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.debates
  add column if not exists election_question_id uuid references public.election_questions(id) on delete set null;

alter table public.debates
  drop constraint if exists debates_status_check;

alter table public.debates
  add constraint debates_status_check
  check (status in ('waiting', 'matching', 'active', 'voting', 'completed', 'expired'));

create index if not exists debates_waiting_question_district_idx
  on public.debates (election_question_id, district_id, created_at)
  where status = 'waiting' and candidate_b_id is null;

comment on column public.debates.election_question_id is
  'Election question this floor was opened on. Null for debates that did not start from the red card.';

drop policy if exists debates_insert_authenticated on public.debates;
create policy debates_insert_authenticated
  on public.debates
  for insert
  to authenticated
  with check (auth.uid() = candidate_a_id);

grant insert on public.debates to authenticated;

notify pgrst, 'reload schema';
