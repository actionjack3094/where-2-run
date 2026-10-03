-- Town Hall on a concluded arena debate. One question per voter. One answer per candidate.

create table if not exists public.constituent_questions (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.arena_debates (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint constituent_questions_content_check check (char_length(btrim(content)) between 1 and 280),
  constraint constituent_questions_one_per_debate unique (debate_id, voter_id)
);

create index if not exists constituent_questions_debate_idx
  on public.constituent_questions (debate_id, created_at);

create table if not exists public.candidate_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.constituent_questions (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint candidate_answers_content_check check (char_length(btrim(content)) between 1 and 2000),
  constraint candidate_answers_one_per_question unique (question_id, candidate_id)
);

create index if not exists candidate_answers_question_idx
  on public.candidate_answers (question_id, created_at);

comment on table public.constituent_questions is
  'One question per verified voter on a concluded arena debate.';
comment on table public.candidate_answers is
  'A seated candidate answers a constituent question once.';

alter table public.constituent_questions enable row level security;
alter table public.candidate_answers enable row level security;

drop policy if exists constituent_questions_public_read on public.constituent_questions;
create policy constituent_questions_public_read
  on public.constituent_questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists constituent_questions_insert_verified on public.constituent_questions;
create policy constituent_questions_insert_verified
  on public.constituent_questions
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
    and exists (
      select 1
      from public.arena_debates
      where arena_debates.id = debate_id
        and arena_debates.status = 'concluded'
    )
  );

drop policy if exists candidate_answers_public_read on public.candidate_answers;
create policy candidate_answers_public_read
  on public.candidate_answers
  for select
  to anon, authenticated
  using (true);

drop policy if exists candidate_answers_insert_seated on public.candidate_answers;
create policy candidate_answers_insert_seated
  on public.candidate_answers
  for insert
  to authenticated
  with check (
    candidate_id = auth.uid()
    and exists (
      select 1
      from public.constituent_questions as question
      join public.arena_debates as debate on debate.id = question.debate_id
      where question.id = question_id
        and debate.status = 'concluded'
        and (debate.candidate_a_id = auth.uid() or debate.candidate_b_id = auth.uid())
    )
  );

grant select on public.constituent_questions, public.candidate_answers to anon, authenticated;
grant insert on public.constituent_questions, public.candidate_answers to authenticated;
grant select, insert, update, delete on public.constituent_questions, public.candidate_answers to service_role;

notify pgrst, 'reload schema';
