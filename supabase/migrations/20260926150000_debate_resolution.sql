-- Final ballot stored on the debate once the voting window closes.

alter table public.debates
  add column if not exists winner_id uuid references public.users(id) on delete set null,
  add column if not exists candidate_a_votes integer not null default 0,
  add column if not exists candidate_b_votes integer not null default 0;

comment on column public.debates.winner_id is
  'Candidate who received more spectator votes. Null when the ballot is tied or unresolved.';
comment on column public.debates.candidate_a_votes is
  'Final spectator ballot count for candidate A.';
comment on column public.debates.candidate_b_votes is
  'Final spectator ballot count for candidate B.';

notify pgrst, 'reload schema';
