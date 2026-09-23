-- Question bank for candidate-mode prompts, plus the stance log that
-- moves a user's ideology vector. Paste into the Supabase SQL editor,
-- or apply with `supabase db push`.

create table if not exists public.election_questions (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  prompt text not null,
  jurisdictional_level text not null,
  primary_axis text not null,
  applicable_ocd_ids jsonb not null default '[]'::jsonb,
  information_gain_score double precision not null default 1,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint election_questions_level_check
    check (jurisdictional_level in ('federal', 'state', 'local')),
  constraint election_questions_axis_check
    check (primary_axis in ('climate', 'healthcare', 'immigration', 'economy', 'social', 'safety')),
  constraint election_questions_gain_check
    check (information_gain_score >= 0 and information_gain_score <= 1),
  constraint election_questions_ocd_array
    check (jsonb_typeof(applicable_ocd_ids) = 'array'),
  constraint election_questions_election_prompt_key unique (election_id, prompt)
);

create index if not exists election_questions_gain_idx
  on public.election_questions (information_gain_score desc, created_at desc);

create index if not exists election_questions_election_idx
  on public.election_questions (election_id);

create index if not exists elections_ocd_id_idx
  on public.elections (ocd_id);

comment on table public.election_questions is
  'Unresolved policy prompts banked onto every election whose OCD-ID the classifier marked applicable.';

comment on column public.election_questions.information_gain_score is
  '1 when nobody has answered. Falls as stances accumulate so unanswered questions sort first.';

create table if not exists public.user_stances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question_id uuid not null references public.election_questions(id) on delete cascade,
  election_id uuid not null references public.elections(id) on delete cascade,
  position_score double precision not null,
  position_label text not null,
  primary_axis text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint user_stances_score_check
    check (position_score >= 0 and position_score <= 1),
  constraint user_stances_axis_check
    check (primary_axis in ('climate', 'healthcare', 'immigration', 'economy', 'social', 'safety')),
  constraint user_stances_user_question_key unique (user_id, question_id)
);

create index if not exists user_stances_user_idx
  on public.user_stances (user_id, created_at desc);

comment on table public.user_stances is
  'One position per user per banked question. The author is inserted immediately and becomes the first participant.';

alter table public.election_questions enable row level security;
alter table public.user_stances enable row level security;

drop policy if exists election_questions_select_public on public.election_questions;
create policy election_questions_select_public
  on public.election_questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists user_stances_select_own on public.user_stances;
create policy user_stances_select_own
  on public.user_stances
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.election_questions from anon, authenticated;
grant select on public.election_questions to anon, authenticated;
grant select, insert, update, delete on public.election_questions to service_role;

revoke all on public.user_stances from anon, authenticated;
grant select on public.user_stances to authenticated;
grant select, insert, update, delete on public.user_stances to service_role;

notify pgrst, 'reload schema';
