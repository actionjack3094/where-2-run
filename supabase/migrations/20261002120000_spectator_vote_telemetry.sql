-- Spectator responses are district-topic telemetry, not debate verdicts.
-- They do not feed tournament Elo.

alter table public.debate_votes
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists district_id text,
  add column if not exists topic_id text,
  add column if not exists selection text;

update public.debate_votes
set user_id = spectator_id
where user_id is null;

update public.debate_votes
set selection = voted_for_user_id::text
where selection is null and voted_for_user_id is not null;

comment on table public.debate_votes is
  'Spectator responses for district-topic telemetry and ideology profiling. Not a debate verdict and not an Elo input.';

comment on column public.debate_votes.user_id is
  'Spectator who logged the response.';

comment on column public.debate_votes.district_id is
  'Physical district the topic belongs to.';

comment on column public.debate_votes.topic_id is
  'Election question the spectator responded to.';

comment on column public.debate_votes.selection is
  'The spectator''s selection. Does not change seated debater ratings.';

notify pgrst, 'reload schema';
