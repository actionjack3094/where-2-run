-- Arbitration Pass path: lock the candidate ELO on the evaluation row,
-- and attach vaulted SetupIntents to the debate they were pledged against.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.debate_evaluations
  add column if not exists elo_rating integer;

comment on column public.debate_evaluations.elo_rating is
  'Candidate ELO written when a definitive Pass verdict locks this evaluation.';

alter table public.campaign_pledges
  add column if not exists debate_id uuid references public.debates(id) on delete set null;

create index if not exists campaign_pledges_debate_idx
  on public.campaign_pledges (debate_id)
  where debate_id is not null;

comment on column public.campaign_pledges.debate_id is
  'Arena debate this SetupIntent is escrowed against. Capture fires on a Pass verdict.';

create or replace function public.lock_arbitration_elo(
  p_debate_id uuid,
  p_candidate_id uuid
)
returns table (elo_rating integer, locked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debate public.debates%rowtype;
  v_eval public.debate_evaluations%rowtype;
  v_opponent uuid;
  v_candidate_elo integer;
  v_opponent_elo integer;
  v_expected_winner double precision;
  v_next_elo integer;
  v_now timestamptz := timezone('utc'::text, now());
begin
  select * into v_debate
  from public.debates
  where id = p_debate_id
  for update;

  if v_debate.id is null then
    raise exception 'Debate not found';
  end if;

  select * into v_eval
  from public.debate_evaluations
  where debate_id = p_debate_id
    and candidate_id = p_candidate_id
  for update;

  if v_eval.id is null then
    raise exception 'Evaluation not found';
  end if;

  if v_eval.status = 'locked' and v_eval.elo_rating is not null then
    elo_rating := v_eval.elo_rating;
    locked := true;
    return next;
    return;
  end if;

  v_opponent := case
    when v_debate.candidate_a_id = p_candidate_id then v_debate.candidate_b_id
    when v_debate.candidate_b_id = p_candidate_id then v_debate.candidate_a_id
    else null
  end;

  select coalesce(u.elo_rating, 1200) into v_candidate_elo
  from public.users u
  where u.id = p_candidate_id;

  if v_opponent is not null then
    select coalesce(u.elo_rating, 1200) into v_opponent_elo
    from public.users u
    where u.id = v_opponent;
  else
    v_opponent_elo := 1200;
  end if;

  v_expected_winner := 1.0 / (
    1.0 + power(10.0, (v_opponent_elo - v_candidate_elo)::double precision / 400.0)
  );
  v_next_elo := greatest(
    100,
    round(v_candidate_elo + 32 * (1 - v_expected_winner))::integer
  );

  update public.users
  set
    elo_rating = v_next_elo,
    updated_at = v_now
  where id = p_candidate_id;

  update public.debates
  set
    elo_applied_at = coalesce(v_debate.elo_applied_at, v_now),
    status = case
      when status in ('active', 'voting') then 'completed'
      else status
    end
  where id = p_debate_id;

  update public.debate_evaluations
  set
    status = 'locked',
    ensemble_result = true,
    elo_rating = v_next_elo,
    updated_at = v_now
  where id = v_eval.id;

  elo_rating := v_next_elo;
  locked := true;
  return next;
end;
$$;

comment on function public.lock_arbitration_elo(uuid, uuid) is
  'On a Pass verdict: recalculate ELO as a win vs the seated opponent and lock it on debate_evaluations.';

revoke all on function public.lock_arbitration_elo(uuid, uuid) from public;
grant execute on function public.lock_arbitration_elo(uuid, uuid) to postgres, service_role;

notify pgrst, 'reload schema';
