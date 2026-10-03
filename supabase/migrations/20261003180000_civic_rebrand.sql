-- Civic rebrand.
-- primary_standings stores the public rating as civic_standing (the live column
-- was elo; some drafts called it elo_rating). Wins and losses leave the table.
-- Primaries gain a level so the elections hub can filter federal, state, and local.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'primary_standings'
      and column_name = 'elo_rating'
  ) then
    alter table public.primary_standings rename column elo_rating to civic_standing;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'primary_standings'
      and column_name = 'elo'
  ) then
    alter table public.primary_standings rename column elo to civic_standing;
  end if;
end $$;

alter table public.primary_standings drop constraint if exists primary_standings_elo_check;
alter table public.primary_standings drop constraint if exists primary_standings_counts_check;

alter table public.primary_standings drop constraint if exists primary_standings_civic_standing_check;
alter table public.primary_standings
  add constraint primary_standings_civic_standing_check check (civic_standing >= 0);

alter table public.primary_standings drop column if exists wins;
alter table public.primary_standings drop column if exists losses;

alter table public.primary_standings
  add column if not exists debates_logged integer not null default 0;

alter table public.primary_standings
  add column if not exists policy_consistency integer not null default 100;

update public.primary_standings
set debates_logged = debates_count
where debates_logged = 0
  and debates_count > 0;

alter table public.primary_standings drop constraint if exists primary_standings_civic_counts_check;
alter table public.primary_standings
  add constraint primary_standings_civic_counts_check check (
    debates_count >= 0
    and debates_logged >= 0
    and ties >= 0
    and policy_consistency between 0 and 100
  );

drop index if exists public.primary_standings_primary_elo_idx;
create index if not exists primary_standings_primary_civic_idx
  on public.primary_standings (primary_id, civic_standing desc);

comment on column public.primary_standings.civic_standing is
  'Public rating for this primary. Replaces Elo. The adherence rubric that produces it stays server-side.';
comment on column public.primary_standings.debates_logged is
  'Finished debates in this primary.';
comment on column public.primary_standings.policy_consistency is
  '0–100. Starts at 100 and moves when the debater’s coordinate drifts.';

-- state and party already exist. party stays lowercase so matchmaking keeps working.
-- Public labels are Democratic, Republican, and Nonpartisan.
alter table public.primaries drop constraint if exists primaries_party_check;
alter table public.primaries
  add constraint primaries_party_check
  check (party in ('democrat', 'republican', 'nonpartisan'));

alter table public.primaries drop constraint if exists primaries_state_code_check;
alter table public.primaries
  add constraint primaries_state_code_check
  check (char_length(btrim(state)) = 2);

alter table public.primaries
  add column if not exists level text not null default 'federal';

alter table public.primaries drop constraint if exists primaries_level_check;
alter table public.primaries
  add constraint primaries_level_check
  check (level in ('federal', 'state', 'local'));

update public.primaries
set level = case
  when office_name ~* 'governor|attorney general|state senate|state house|lieutenant' then 'state'
  when office_name ~* 'mayor|council|school|county|municipal|city' then 'local'
  when office_name ~* 'senate|house|president|congress' then 'federal'
  else 'local'
end;

comment on column public.primaries.state is 'Two-letter state code, for example TX.';
comment on column public.primaries.level is 'federal, state, or local.';
comment on column public.primaries.party is 'democrat, republican, or nonpartisan.';

create or replace function public.refresh_candidate_tiers()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with active as (
    select
      standing.user_id,
      standing.primary_id,
      standing.civic_standing,
      profile.is_verified,
      profile.tier2_status,
      profile.legal_name
    from public.primary_standings as standing
    join public.profiles as profile on profile.id = standing.user_id
    where standing.debates_count > 0
      and profile.is_synthetic = false
  ),
  scored as (
    select
      active.user_id,
      active.primary_id,
      case
        when (active.is_verified or active.tier2_status = 'verified')
          and active.legal_name is not null
          and length(btrim(active.legal_name)) > 0
          and (
            select count(*)::double precision
            from active as peer
            where peer.primary_id = active.primary_id
              and peer.civic_standing < active.civic_standing
          ) / (
            select count(*)::double precision
            from active as peer
            where peer.primary_id = active.primary_id
          ) >= 0.9 then 'frontrunner'
        when (active.is_verified or active.tier2_status = 'verified')
          and active.legal_name is not null
          and length(btrim(active.legal_name)) > 0
          and (
            select count(*)::double precision
            from active as peer
            where peer.primary_id = active.primary_id
              and peer.civic_standing < active.civic_standing
          ) / (
            select count(*)::double precision
            from active as peer
            where peer.primary_id = active.primary_id
          ) >= 0.5 then 'declared_candidate'
        else 'pundit'
      end as tier
    from active
  ),
  best as (
    select
      user_id,
      case
        when bool_or(tier = 'frontrunner') then 'frontrunner'
        when bool_or(tier = 'declared_candidate') then 'declared_candidate'
        else 'pundit'
      end as tier
    from scored
    group by user_id
  )
  update public.profiles as profile
  set
    candidate_tier = coalesce(best.tier, 'pundit'),
    updated_at = timezone('utc', now())
  from best
  where profile.id = best.user_id
    and profile.candidate_tier is distinct from best.tier;

  update public.profiles as profile
  set
    candidate_tier = 'pundit',
    updated_at = timezone('utc', now())
  where profile.is_synthetic = false
    and profile.candidate_tier <> 'pundit'
    and not exists (
      select 1
      from public.primary_standings as standing
      where standing.user_id = profile.id
        and standing.debates_count > 0
    );
end;
$$;

comment on function public.refresh_candidate_tiers() is
  'Sets profiles.candidate_tier from the best per-primary civic standing percentile.';

notify pgrst, 'reload schema';
