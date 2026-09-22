-- Ideological vector matching: pgvector(10) on candidate tickets + district RPC.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- candidates.ideology_vector is the 10-question calibration quiz coordinate.
-- districts.median_ideology_vector is the seat median. match_districts ranks
-- districts by cosine distance (<=>) so the Next.js backend can RPC the closest
-- ideological seats for a candidate.

create extension if not exists vector;

-- Stub the ticket table if onboarding has not landed yet, then attach the vector.
create table if not exists public.candidates (
  id uuid primary key references public.users(id) on delete cascade
);

alter table public.candidates
  add column if not exists ideology_vector vector(10);

comment on column public.candidates.ideology_vector is
  'pgvector(10) ideological coordinate from the Likert calibration quiz.';

-- HNSW + vector_cosine_ops is required for cosine-distance (<=>) lookups.
do $$
begin
  begin
    execute $sql$
      create index if not exists candidates_ideology_vector_cosine_idx
        on public.candidates
        using hnsw (ideology_vector vector_cosine_ops)
    $sql$;
  exception
    when others then
      begin
        execute $sql$
          create index if not exists candidates_ideology_vector_cosine_idx
            on public.candidates
            using ivfflat (ideology_vector vector_cosine_ops)
            with (lists = 10)
        $sql$;
      exception
        when others then
          raise notice 'Skipping candidates_ideology_vector_cosine_idx: %', SQLERRM;
      end;
  end;
end $$;

-- Index district medians so match_districts can use the same cosine operator class.
do $$
begin
  begin
    execute $sql$
      create index if not exists districts_median_ideology_vector_cosine_idx
        on public.districts
        using hnsw (median_ideology_vector vector_cosine_ops)
    $sql$;
  exception
    when others then
      begin
        execute $sql$
          create index if not exists districts_median_ideology_vector_cosine_idx
            on public.districts
            using ivfflat (median_ideology_vector vector_cosine_ops)
            with (lists = 10)
        $sql$;
      exception
        when others then
          raise notice 'Skipping districts_median_ideology_vector_cosine_idx: %', SQLERRM;
      end;
  end;
end $$;

-- Closest ideological district matches for a candidate query embedding.
-- similarity = 1 - cosine distance; match_threshold is a minimum similarity in (0, 1].
create or replace function public.match_districts(
  query_embedding vector(10),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  name text,
  level text,
  pvi_score numeric,
  historical_lean text,
  median_ideology_vector vector(10),
  zip_code text,
  state text,
  cosine_distance double precision,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer;
  v_threshold double precision;
begin
  if query_embedding is null then
    return;
  end if;

  v_limit := greatest(1, least(coalesce(match_count, 10), 50));
  v_threshold := greatest(
    0::double precision,
    least(1::double precision, coalesce(match_threshold, 0)::double precision)
  );

  return query
  select
    d.id,
    d.name,
    d.level::text,
    d.pvi_score::numeric,
    d.historical_lean,
    d.median_ideology_vector,
    d.zip_code,
    d.state,
    (d.median_ideology_vector <=> query_embedding)::double precision as cosine_distance,
    (1 - (d.median_ideology_vector <=> query_embedding))::double precision as similarity
  from public.districts as d
  where d.median_ideology_vector is not null
    and 1 - (d.median_ideology_vector <=> query_embedding) > v_threshold
  order by d.median_ideology_vector <=> query_embedding
  limit v_limit;
end;
$$;

comment on function public.match_districts(vector, float, int) is
  'Returns districts whose median_ideology_vector is closest (pgvector cosine distance) to the candidate query embedding.';

revoke all on function public.match_districts(vector, float, int) from public;
grant execute on function public.match_districts(vector, float, int)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
