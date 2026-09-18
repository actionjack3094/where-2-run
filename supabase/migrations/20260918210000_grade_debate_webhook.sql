-- Phase 11: Anti-Troll AI Grader & Dynamic Vector Updates
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.
--
-- Active debate filings live in public.arguments (there is no debate_responses table).
-- This Database Webhook POSTs each new filing to the grade-debate Edge Function.
--
-- Optional Vault secrets (set once per environment):
--   select vault.create_secret(
--     'http://host.docker.internal:54321/functions/v1/grade-debate',
--     'grade_debate_url'
--   );
--   select vault.create_secret('<SUPABASE_ANON_OR_SERVICE_ROLE_KEY>', 'grade_debate_anon_key');
-- Hosted URL shape: https://<project-ref>.supabase.co/functions/v1/grade-debate

create extension if not exists pg_net;

alter table public.arguments
  add column if not exists graded_at timestamptz;

comment on column public.arguments.graded_at is
  'Set by the grade-debate Edge Function after it writes the author ideology_vector shift.';

create or replace function public.grade_debate_webhook_url()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  secret_url text;
begin
  begin
    select decrypted_secret into secret_url
    from vault.decrypted_secrets
    where name = 'grade_debate_url'
    limit 1;
  exception
    when undefined_table then
      secret_url := null;
    when others then
      secret_url := null;
  end;

  if secret_url is not null and length(trim(secret_url)) > 0 then
    return trim(secret_url);
  end if;

  -- Postgres runs in Docker locally; localhost would point at the DB container.
  return 'http://host.docker.internal:54321/functions/v1/grade-debate';
end;
$$;

create or replace function public.grade_debate_webhook_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  secret_key text;
begin
  begin
    select decrypted_secret into secret_key
    from vault.decrypted_secrets
    where name = 'grade_debate_anon_key'
    limit 1;
  exception
    when undefined_table then
      secret_key := null;
    when others then
      secret_key := null;
  end;

  return nullif(trim(coalesce(secret_key, '')), '');
end;
$$;

create or replace function public.trigger_grade_debate()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  fn_url text;
  fn_key text;
  headers jsonb;
begin
  fn_url := public.grade_debate_webhook_url();
  fn_key := public.grade_debate_webhook_key();
  headers := jsonb_build_object('Content-Type', 'application/json');

  if fn_key is not null then
    headers := headers || jsonb_build_object(
      'Authorization', 'Bearer ' || fn_key,
      'apikey', fn_key
    );
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := headers,
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

comment on function public.trigger_grade_debate() is
  'Database Webhook: POST inserted arguments rows to the grade-debate Edge Function via pg_net.';

drop trigger if exists grade_debate_on_argument_insert on public.arguments;
create trigger grade_debate_on_argument_insert
  after insert on public.arguments
  for each row
  execute procedure public.trigger_grade_debate();

revoke all on function public.trigger_grade_debate() from public;
revoke all on function public.grade_debate_webhook_url() from public;
revoke all on function public.grade_debate_webhook_key() from public;
grant execute on function public.trigger_grade_debate() to postgres, service_role;
grant execute on function public.grade_debate_webhook_url() to postgres, service_role;
grant execute on function public.grade_debate_webhook_key() to postgres, service_role;

notify pgrst, 'reload schema';
