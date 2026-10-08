-- Candidate filings for the live floor live in public.arguments.
-- Publish that table so the debate view can append rounds over Realtime.

alter table public.arguments replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'arguments'
  ) then
    alter publication supabase_realtime add table public.arguments;
  end if;
end $$;
