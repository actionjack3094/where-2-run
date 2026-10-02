-- Live debate floor. debates may already be in supabase_realtime
-- (20260926133000). Add each table only when it is missing.
-- Equivalent when both are absent:
--   alter publication supabase_realtime add table debates, debate_votes;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'debates'
  ) then
    alter publication supabase_realtime add table public.debates;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'debate_votes'
  ) then
    alter publication supabase_realtime add table public.debate_votes;
  end if;
end $$;
