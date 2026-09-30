-- Verified constituents count 3x when a debate is decided.
--
-- The winner is computed in three places: lib/actions/debate-resolution.ts
-- (page load + nightly job), this function (which apply_debate_elo() calls to
-- pick who gains Elo), and complete_expired_debates() (the hourly cron). They
-- have to agree, or the recorded winner and the Elo winner can differ. The
-- TypeScript rule lives in lib/vote-weight.ts; keep the weights in sync.
--
--   weight 3: the voter's tier2_verifications.ocd_ids contains the debate's
--             district (election OCD-ID, else the district row's OCD-ID)
--   weight 1: everyone else (spectators, bots, unverified accounts)
--
-- A debate with no resolvable district gives every ballot weight 1.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create or replace function public.debate_district_ocd_id(debate_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(lower(btrim(coalesce(e.ocd_id, dist.ocd_id))), '')
  from public.debates d
  left join public.election_questions q on q.id = d.election_question_id
  left join public.elections e on e.id = coalesce(d.election_id, q.election_id)
  left join public.districts dist on dist.id = coalesce(e.district_id, d.district_id)
  where d.id = debate_uuid;
$$;

comment on function public.debate_district_ocd_id(uuid) is
  'OCD-ID of the district a debate was filed in. Null when it cannot be resolved.';

revoke all on function public.debate_district_ocd_id(uuid) from public;
grant execute on function public.debate_district_ocd_id(uuid) to service_role, postgres;

-- Security definer so the tally is the same for every caller: tier2_verifications
-- is select-own under RLS, so an invoker-rights tally would only see the
-- caller's own verification. It returns a candidate id and nothing else.
create or replace function public.calculate_debate_winner(debate_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with debate_row as (
    select
      d.candidate_a_id,
      d.candidate_b_id,
      public.debate_district_ocd_id(d.id) as ocd_id
    from public.debates d
    where d.id = debate_uuid
  ),
  tallies as (
    select
      v.candidate_id,
      sum(
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
        end
      )::int as vote_count
    from public.votes v
    cross join debate_row d
    where v.debate_id = debate_uuid
      and v.voided_at is null
      and v.candidate_id in (d.candidate_a_id, d.candidate_b_id)
    group by v.candidate_id
  ),
  ranked as (
    select
      candidate_id,
      vote_count,
      rank() over (order by vote_count desc) as place
    from tallies
  )
  select candidate_id
  from ranked
  where place = 1
    and (select count(*) from ranked where place = 1) = 1;
$$;

comment on function public.calculate_debate_winner(uuid) is
  'Winning candidate from live ballots, verified constituents weighted 3x. Null on a tie, an empty ballot, or when every vote was voided.';

notify pgrst, 'reload schema';
