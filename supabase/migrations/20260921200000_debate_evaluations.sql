-- Automated AI arbitration records for the Primary Judge and Ensemble Court.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create table if not exists public.debate_evaluations (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  candidate_id uuid not null references public.users(id) on delete cascade,
  primary_score numeric not null,
  confidence_score numeric not null,
  rubric_flag text,
  addendum_text text,
  ensemble_result boolean,
  status text not null default 'evaluated'
    check (status in ('evaluated', 'appealed', 'locked')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (debate_id, candidate_id),
  check (confidence_score >= 0 and confidence_score <= 1),
  check (primary_score >= 0 and primary_score <= 100),
  check (
    addendum_text is null
    or char_length(trim(addendum_text)) > 0
  )
);

create index if not exists debate_evaluations_debate_idx
  on public.debate_evaluations (debate_id, created_at desc);

create index if not exists debate_evaluations_candidate_idx
  on public.debate_evaluations (candidate_id, created_at desc);

comment on table public.debate_evaluations is
  'Primary Judge scores and Ensemble Court appeals for a seated candidate in a debate.';

comment on column public.debate_evaluations.primary_score is
  'Primary LLM rubric score from 0 to 100.';
comment on column public.debate_evaluations.confidence_score is
  'Primary LLM confidence from 0 to 1. 0.60–0.89 unlocks a 150-word addendum.';
comment on column public.debate_evaluations.rubric_flag is
  'Weakest public-rubric criterion the Primary Judge named.';
comment on column public.debate_evaluations.addendum_text is
  'Candidate clarification of the rubric_flag, capped at 150 words.';
comment on column public.debate_evaluations.ensemble_result is
  'Majority pass (true) or fail (false) from the three-model Ensemble Court.';
comment on column public.debate_evaluations.status is
  'evaluated = primary score written; appealed = addendum filed; locked = ensemble voted and ELO is sealed.';

alter table public.debate_evaluations enable row level security;

drop policy if exists debate_evaluations_select_public on public.debate_evaluations;
create policy debate_evaluations_select_public
  on public.debate_evaluations
  for select
  to anon, authenticated
  using (true);

grant select on public.debate_evaluations to anon, authenticated, service_role;
grant select, insert, update, delete on public.debate_evaluations to service_role;

notify pgrst, 'reload schema';
