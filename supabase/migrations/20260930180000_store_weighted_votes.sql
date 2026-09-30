-- Persist weighted vote totals next to the raw ballot counts.
--
-- Verified constituents count 3x (20260930160000_weighted_debate_winner.sql), so
-- a debate can be won by the side with fewer ballots. debates.candidate_*_votes
-- keeps the raw count (one per ballot); the new columns hold the weighted total
-- that actually decided the winner. 0/0 means "not tallied yet" (open debates,
-- and debates completed before this migration); the UI falls back to raw.
--
-- Also gives the SQL resolution path (hourly cron) the same behaviour as
-- lib/actions/debate-resolution.ts: write both counts and the winner when a
-- debate completes. Weights are defined once, in debate_tally() below, and
-- mirrored in lib/vote-weight.ts.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

alter table public.debates
  add column if not exists candidate_a_weighted_votes integer not null default 0,
  add column if not exists candidate_b_weighted_votes integer not null default 0;

comment on column public.debates.candidate_a_weighted_votes is
  'Weighted ballot total for candidate A (verified constituents count 3, others 1). Decides the winner. 0 with candidate_b_weighted_votes = 0 means not tallied.';
comment on column public.debates.candidate_b_weighted_votes is
  'Weighted ballot total for candidate B (verified constituents count 3, others 1). Decides the winner. 0 with candidate_a_weighted_votes = 0 means not tallied.';

-- One tally for everything: raw counts, weighted totals, and the winner (null on
-- a tie or an empty ballot). Voided ballots are ignored; a debate with no
-- resolvable district weights every ballot 1. Security definer so every caller
-- sees the same numbers (tier2_verifications is select-own under RLS); it is
-- not exposed to anon or authenticated.
create or replace function public.debate_tally(debate_uuid uuid)
returns table (
  raw_a integer,
  raw_b integer,
  weighted_a integer,
  weighted_b integer,
  winner_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select
      id,
      candidate_a_id as a,
      candidate_b_id as b,
      public.debate_district_ocd_id(id) as ocd_id
    from public.debates
    where id = debate_uuid
  ),
  ballots as (
    select
      v.candidate_id,
      case
        when d.ocd_id is not null and exists (
          select 1
          from public.tier2_verifications t
          where t.user_id = v.voter_id
            and exists (
              select 1
              from jsonb_array_elements_text(t.ocd_ids) as held(ocd_id)
              where lower(btrim(held.ocd_id)) = d.ocd_id
            )
        ) then 3
        else 1
      end as weight
    from public.votes v
    join d on d.id = v.debate_id
    where v.voided_at is null
      and v.candidate_id in (d.a, d.b)
  ),
  totals as (
    select
      (count(*) filter (where candidate_id = (select a from d)))::int as raw_a,
      (count(*) filter (where candidate_id = (select b from d)))::int as raw_b,
      (coalesce(sum(weight) filter (where candidate_id = (select a from d)), 0))::int as weighted_a,
      (coalesce(sum(weight) filter (where candidate_id = (select b from d)), 0))::int as weighted_b
    from ballots
  )
  select
    t.raw_a,
    t.raw_b,
    t.weighted_a,
    t.weighted_b,
    case
      when t.weighted_a > t.weighted_b then d.a
      when t.weighted_b > t.weighted_a then d.b
      else null
    end
  from totals t
  cross join d;
$$;

comment on function public.debate_tally(uuid) is
  'Raw and weighted (3x verified constituent) ballot totals for a debate, plus the winner. Null winner on a tie or empty ballot.';

revoke all on function public.debate_tally(uuid) from public;
grant execute on function public.debate_tally(uuid) to service_role, postgres;

-- Same contract as before, now a thin wrapper so the winner cannot drift from
-- the stored totals.
create or replace function public.calculate_debate_winner(debate_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select winner_id from public.debate_tally(debate_uuid);
$$;

comment on function public.calculate_debate_winner(uuid) is
  'Winning candidate from live ballots, verified constituents weighted 3x. Null on a tie, an empty ballot, or when every vote was voided.';

-- Hourly finalization: store the tally and winner before Elo is applied, so a
-- cron-completed debate shows the same scores as one resolved by the app.
-- Still skips open jury holds and unseated floors.
create or replace function public.complete_expired_debates()
returns table (debate_id uuid, winner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  tally record;
begin
  for rec in
    update public.debates d
    set status = 'completed'
    where d.expires_at < now()
      and d.status in ('active', 'voting')
      and d.candidate_a_id is not null
      and d.candidate_b_id is not null
      and not exists (
        select 1
        from public.arbitration_cases c
        where c.debate_id = d.id
          and c.status = 'open'
          and c.holds_elo
      )
    returning d.id
  loop
    select * into tally from public.debate_tally(rec.id);

    update public.debates
    set
      candidate_a_votes = tally.raw_a,
      candidate_b_votes = tally.raw_b,
      candidate_a_weighted_votes = tally.weighted_a,
      candidate_b_weighted_votes = tally.weighted_b,
      winner_id = tally.winner_id
    where id = rec.id;

    perform public.apply_debate_elo(rec.id);
    debate_id := rec.id;
    winner_id := tally.winner_id;
    return next;
  end loop;
end;
$$;

comment on function public.complete_expired_debates() is
  'Completes expired seated debates, stores raw and weighted tallies and the winner, and applies ELO. Skips open jury holds.';

notify pgrst, 'reload schema';
