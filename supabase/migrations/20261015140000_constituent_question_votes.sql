-- In-district upvotes on hub-and-spoke questions.
-- One vote per voter per question. The debate page toggles the row.

create table if not exists public.constituent_question_votes (
  question_id uuid not null references public.constituent_questions (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (question_id, voter_id)
);

create index if not exists constituent_question_votes_question_idx
  on public.constituent_question_votes (question_id);

comment on table public.constituent_question_votes is
  'One in-district upvote per verified voter on a constituent question.';

alter table public.constituent_question_votes enable row level security;

drop policy if exists constituent_question_votes_public_read on public.constituent_question_votes;
create policy constituent_question_votes_public_read
  on public.constituent_question_votes
  for select
  to anon, authenticated
  using (true);

grant select on public.constituent_question_votes to anon, authenticated;
grant select, insert, update, delete on public.constituent_question_votes to service_role;

notify pgrst, 'reload schema';
