-- Spectator ballots are district/topic telemetry. They do not update debater Elo.

alter table public.debate_votes
  add column if not exists district_id uuid references public.districts(id) on delete set null,
  add column if not exists topic_id uuid references public.election_questions(id) on delete set null;

create index if not exists debate_votes_district_topic_idx
  on public.debate_votes (district_id, topic_id);

comment on column public.debate_votes.spectator_id is
  'User id of the spectator who cast the ballot.';
comment on column public.debate_votes.district_id is
  'District the debate was filed in. Telemetry only; not an Elo input.';
comment on column public.debate_votes.topic_id is
  'election_questions.id for the debate prompt. Telemetry only; not an Elo input.';
comment on column public.debate_votes.voted_for_user_id is
  'Seated debater the spectator selected.';
