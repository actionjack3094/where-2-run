-- Candidate onboarding: dedicated ticket table with a pgvector ideology coordinate.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create extension if not exists vector;

create table if not exists public.candidates (
  id uuid primary key references public.users(id) on delete cascade,
  display_name text not null,
  office_sought text,
  bio text,
  residency_state text,
  ideology_vector vector(10) not null,
  pac_agreement_accepted boolean not null default false,
  pac_agreement_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vector-matching may have created a stub candidates table first.
alter table public.candidates
  add column if not exists display_name text,
  add column if not exists office_sought text,
  add column if not exists bio text,
  add column if not exists residency_state text,
  add column if not exists ideology_vector vector(10),
  add column if not exists pac_agreement_accepted boolean not null default false,
  add column if not exists pac_agreement_accepted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.candidates
set display_name = coalesce(nullif(btrim(display_name), ''), 'Candidate')
where display_name is null or btrim(display_name) = '';

do $$
begin
  alter table public.candidates alter column display_name set not null;
exception
  when others then
    null;
end $$;

comment on table public.candidates is
  'Filed candidate tickets. ideology_vector is the 10-dimensional onboarding quiz coordinate.';

comment on column public.candidates.ideology_vector is
  'pgvector(10) ideological coordinate parsed from the Likert onboarding quiz.';

comment on column public.candidates.pac_agreement_accepted is
  'True after the candidate accepts the Conduit PAC vault-and-capture terms.';

do $$
begin
  begin
    execute 'create index if not exists candidates_ideology_vector_cosine_idx on public.candidates using hnsw (ideology_vector vector_cosine_ops)';
  exception
    when others then
      begin
        execute 'create index if not exists candidates_ideology_vector_cosine_idx on public.candidates using ivfflat (ideology_vector vector_cosine_ops) with (lists = 10)';
      exception
        when others then
          null;
      end;
  end;
end $$;

alter table public.candidates enable row level security;

drop policy if exists candidates_select_public on public.candidates;
create policy candidates_select_public
  on public.candidates
  for select
  to anon, authenticated
  using (true);

grant select on public.candidates to anon, authenticated;
grant select, insert, update, delete on public.candidates to service_role;

notify pgrst, 'reload schema';
