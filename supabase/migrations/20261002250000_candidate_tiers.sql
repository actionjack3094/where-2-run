-- Recompute profiles.candidate_tier from per-primary Elo.
-- The field is every real debater with at least one finished match.
-- Declared Candidate is the top 50 percent, Frontrunner the top 10 percent.
-- Both require Stripe verification and a legal name. Everyone else stays Pundit.

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
      standing.elo,
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
              and peer.elo < active.elo
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
              and peer.elo < active.elo
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
  'Sets profiles.candidate_tier from the best per-primary Elo percentile. Verification and a legal name are required above Pundit.';

revoke all on function public.refresh_candidate_tiers() from public, anon, authenticated;
grant execute on function public.refresh_candidate_tiers() to postgres, service_role;
