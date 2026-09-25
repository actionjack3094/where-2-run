drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

create type "public"."verification_status" as enum ('PENDING', 'VERIFIED', 'REJECTED');

alter table "public"."profiles" drop constraint "profiles_id_fkey";


  create table "public"."clubs" (
    "id" uuid not null default gen_random_uuid(),
    "manager_id" uuid not null,
    "name" text not null,
    "tag" character varying(5) not null,
    "primary_color" text default '#0f172a'::text,
    "secondary_color" text default '#38bdf8'::text,
    "logo_url" text,
    "tier" text default 'Tier 3 Regional'::text,
    "club_rank_points" integer default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."clubs" enable row level security;


  create table "public"."gear_items" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "category" text not null,
    "price" integer not null,
    "unlocked" boolean not null default false,
    "stat_bonus" text not null
      );



  create table "public"."match_stats" (
    "id" uuid not null default gen_random_uuid(),
    "player_id" uuid,
    "game_id" uuid,
    "points" integer default 0,
    "rebounds" integer default 0,
    "assists" integer default 0,
    "steals" integer default 0,
    "blocks" integer default 0,
    "is_win" boolean default false,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."matches" (
    "id" uuid not null default gen_random_uuid(),
    "opponent" text not null,
    "result" text not null,
    "score" text not null,
    "points" integer not null default 0,
    "rebounds" integer not null default 0,
    "two_pointers" integer not null default 0,
    "tokens_earned" integer not null default 0,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "profile_id" uuid
      );


alter table "public"."matches" enable row level security;


  create table "public"."offers" (
    "id" uuid not null default gen_random_uuid(),
    "club_id" uuid not null,
    "manager_id" uuid not null,
    "player_id" uuid not null,
    "proposed_role" text default 'STARTER'::text,
    "proposed_prize_share" numeric(5,2) not null,
    "contract_tournaments" integer default 1,
    "status" text default 'PENDING'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."offers" enable row level security;


  create table "public"."player_combines" (
    "id" uuid not null default gen_random_uuid(),
    "player_id" uuid,
    "test_type" text not null,
    "metric_value" text not null,
    "media_url" text not null,
    "status" public.verification_status default 'PENDING'::public.verification_status,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."squad_contracts" (
    "id" uuid not null default gen_random_uuid(),
    "club_id" uuid,
    "user_id" uuid,
    "player_name" text not null,
    "role" text default 'STARTER'::text,
    "prize_share" numeric(5,2),
    "gm_management_fee" numeric(5,2) default 0.00,
    "contract_tournaments_remaining" integer default 1,
    "status" text default 'ACTIVE'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."squad_contracts" enable row level security;


  create table "public"."team_contracts" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid not null,
    "player_id" uuid,
    "role" text default 'STARTER'::text,
    "prize_share_percentage" numeric default 25.00,
    "status" text default 'ACTIVE'::text,
    "signed_at" timestamp with time zone default now()
      );



  create table "public"."trades" (
    "id" uuid not null default gen_random_uuid(),
    "offering_club_id" uuid not null,
    "target_club_id" uuid not null,
    "offered_player_id" uuid not null,
    "target_player_id" uuid not null,
    "status" text default 'PROPOSED'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."trades" enable row level security;

alter table "public"."profiles" add column "club_name" text not null default 'ATX Ballers'::text;

alter table "public"."profiles" add column "current_club_id" uuid;

alter table "public"."profiles" add column "gm_fee_percentage" numeric(5,2) default 10.00;

alter table "public"."profiles" add column "perk_badges" jsonb default '[]'::jsonb;

alter table "public"."profiles" add column "player_name" text not null default 'Crown Hooper'::text;

alter table "public"."profiles" add column "ranking_points" integer default 0;

alter table "public"."profiles" add column "token_balance" integer not null default 3400;

alter table "public"."profiles" add column "transfer_status" text default 'FREE_AGENT'::text;

alter table "public"."profiles" add column "user_role" text default 'ATHLETE'::text;

alter table "public"."profiles" alter column "id" set default gen_random_uuid();

alter table "public"."profiles" alter column "updated_at" set default now();

CREATE UNIQUE INDEX clubs_name_key ON public.clubs USING btree (name);

CREATE UNIQUE INDEX clubs_pkey ON public.clubs USING btree (id);

CREATE UNIQUE INDEX gear_items_pkey ON public.gear_items USING btree (id);

CREATE UNIQUE INDEX match_stats_pkey ON public.match_stats USING btree (id);

CREATE UNIQUE INDEX matches_pkey ON public.matches USING btree (id);

CREATE UNIQUE INDEX offers_pkey ON public.offers USING btree (id);

CREATE UNIQUE INDEX player_combines_pkey ON public.player_combines USING btree (id);

CREATE UNIQUE INDEX squad_contracts_pkey ON public.squad_contracts USING btree (id);

CREATE UNIQUE INDEX team_contracts_pkey ON public.team_contracts USING btree (id);

CREATE UNIQUE INDEX trades_pkey ON public.trades USING btree (id);

alter table "public"."clubs" add constraint "clubs_pkey" PRIMARY KEY using index "clubs_pkey";

alter table "public"."gear_items" add constraint "gear_items_pkey" PRIMARY KEY using index "gear_items_pkey";

alter table "public"."match_stats" add constraint "match_stats_pkey" PRIMARY KEY using index "match_stats_pkey";

alter table "public"."matches" add constraint "matches_pkey" PRIMARY KEY using index "matches_pkey";

alter table "public"."offers" add constraint "offers_pkey" PRIMARY KEY using index "offers_pkey";

alter table "public"."player_combines" add constraint "player_combines_pkey" PRIMARY KEY using index "player_combines_pkey";

alter table "public"."squad_contracts" add constraint "squad_contracts_pkey" PRIMARY KEY using index "squad_contracts_pkey";

alter table "public"."team_contracts" add constraint "team_contracts_pkey" PRIMARY KEY using index "team_contracts_pkey";

alter table "public"."trades" add constraint "trades_pkey" PRIMARY KEY using index "trades_pkey";

alter table "public"."clubs" add constraint "clubs_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."clubs" validate constraint "clubs_manager_id_fkey";

alter table "public"."clubs" add constraint "clubs_name_key" UNIQUE using index "clubs_name_key";

alter table "public"."match_stats" add constraint "match_stats_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."match_stats" validate constraint "match_stats_player_id_fkey";

alter table "public"."matches" add constraint "matches_result_check" CHECK ((result = ANY (ARRAY['WIN'::text, 'LOSS'::text]))) not valid;

alter table "public"."matches" validate constraint "matches_result_check";

alter table "public"."offers" add constraint "offers_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."offers" validate constraint "offers_club_id_fkey";

alter table "public"."offers" add constraint "offers_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."offers" validate constraint "offers_manager_id_fkey";

alter table "public"."offers" add constraint "offers_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."offers" validate constraint "offers_player_id_fkey";

alter table "public"."player_combines" add constraint "player_combines_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."player_combines" validate constraint "player_combines_player_id_fkey";

alter table "public"."profiles" add constraint "profiles_current_club_id_fkey" FOREIGN KEY (current_club_id) REFERENCES public.clubs(id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_current_club_id_fkey";

alter table "public"."squad_contracts" add constraint "squad_contracts_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."squad_contracts" validate constraint "squad_contracts_club_id_fkey";

alter table "public"."squad_contracts" add constraint "squad_contracts_prize_share_check" CHECK (((prize_share >= (0)::numeric) AND (prize_share <= (100)::numeric))) not valid;

alter table "public"."squad_contracts" validate constraint "squad_contracts_prize_share_check";

alter table "public"."squad_contracts" add constraint "squad_contracts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."squad_contracts" validate constraint "squad_contracts_user_id_fkey";

alter table "public"."team_contracts" add constraint "team_contracts_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."team_contracts" validate constraint "team_contracts_player_id_fkey";

alter table "public"."trades" add constraint "trades_offered_player_id_fkey" FOREIGN KEY (offered_player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."trades" validate constraint "trades_offered_player_id_fkey";

alter table "public"."trades" add constraint "trades_offering_club_id_fkey" FOREIGN KEY (offering_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."trades" validate constraint "trades_offering_club_id_fkey";

alter table "public"."trades" add constraint "trades_target_club_id_fkey" FOREIGN KEY (target_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE not valid;

alter table "public"."trades" validate constraint "trades_target_club_id_fkey";

alter table "public"."trades" add constraint "trades_target_player_id_fkey" FOREIGN KEY (target_player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."trades" validate constraint "trades_target_player_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, full_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    now(),
    now()
  )
  on conflict (id) do update
  set 
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."arguments" to "supabase_auth_admin";

grant insert on table "public"."arguments" to "supabase_auth_admin";

grant references on table "public"."arguments" to "supabase_auth_admin";

grant select on table "public"."arguments" to "supabase_auth_admin";

grant trigger on table "public"."arguments" to "supabase_auth_admin";

grant truncate on table "public"."arguments" to "supabase_auth_admin";

grant update on table "public"."arguments" to "supabase_auth_admin";

grant delete on table "public"."campaign_pledges" to "supabase_auth_admin";

grant insert on table "public"."campaign_pledges" to "supabase_auth_admin";

grant references on table "public"."campaign_pledges" to "supabase_auth_admin";

grant select on table "public"."campaign_pledges" to "supabase_auth_admin";

grant trigger on table "public"."campaign_pledges" to "supabase_auth_admin";

grant truncate on table "public"."campaign_pledges" to "supabase_auth_admin";

grant update on table "public"."campaign_pledges" to "supabase_auth_admin";

grant delete on table "public"."campaign_targets" to "supabase_auth_admin";

grant insert on table "public"."campaign_targets" to "supabase_auth_admin";

grant references on table "public"."campaign_targets" to "supabase_auth_admin";

grant select on table "public"."campaign_targets" to "supabase_auth_admin";

grant trigger on table "public"."campaign_targets" to "supabase_auth_admin";

grant truncate on table "public"."campaign_targets" to "supabase_auth_admin";

grant update on table "public"."campaign_targets" to "supabase_auth_admin";

grant delete on table "public"."candidates" to "supabase_auth_admin";

grant insert on table "public"."candidates" to "supabase_auth_admin";

grant references on table "public"."candidates" to "supabase_auth_admin";

grant select on table "public"."candidates" to "supabase_auth_admin";

grant trigger on table "public"."candidates" to "supabase_auth_admin";

grant truncate on table "public"."candidates" to "supabase_auth_admin";

grant update on table "public"."candidates" to "supabase_auth_admin";

grant delete on table "public"."clubs" to "anon";

grant insert on table "public"."clubs" to "anon";

grant references on table "public"."clubs" to "anon";

grant select on table "public"."clubs" to "anon";

grant trigger on table "public"."clubs" to "anon";

grant truncate on table "public"."clubs" to "anon";

grant update on table "public"."clubs" to "anon";

grant delete on table "public"."clubs" to "authenticated";

grant insert on table "public"."clubs" to "authenticated";

grant references on table "public"."clubs" to "authenticated";

grant select on table "public"."clubs" to "authenticated";

grant trigger on table "public"."clubs" to "authenticated";

grant truncate on table "public"."clubs" to "authenticated";

grant update on table "public"."clubs" to "authenticated";

grant delete on table "public"."clubs" to "service_role";

grant insert on table "public"."clubs" to "service_role";

grant references on table "public"."clubs" to "service_role";

grant select on table "public"."clubs" to "service_role";

grant trigger on table "public"."clubs" to "service_role";

grant truncate on table "public"."clubs" to "service_role";

grant update on table "public"."clubs" to "service_role";

grant delete on table "public"."clubs" to "supabase_auth_admin";

grant insert on table "public"."clubs" to "supabase_auth_admin";

grant references on table "public"."clubs" to "supabase_auth_admin";

grant select on table "public"."clubs" to "supabase_auth_admin";

grant trigger on table "public"."clubs" to "supabase_auth_admin";

grant truncate on table "public"."clubs" to "supabase_auth_admin";

grant update on table "public"."clubs" to "supabase_auth_admin";

grant delete on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant insert on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant references on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant select on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant trigger on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant truncate on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant update on table "public"."coalition_endorsements" to "supabase_auth_admin";

grant delete on table "public"."coalition_members" to "supabase_auth_admin";

grant insert on table "public"."coalition_members" to "supabase_auth_admin";

grant references on table "public"."coalition_members" to "supabase_auth_admin";

grant select on table "public"."coalition_members" to "supabase_auth_admin";

grant trigger on table "public"."coalition_members" to "supabase_auth_admin";

grant truncate on table "public"."coalition_members" to "supabase_auth_admin";

grant update on table "public"."coalition_members" to "supabase_auth_admin";

grant delete on table "public"."coalitions" to "supabase_auth_admin";

grant insert on table "public"."coalitions" to "supabase_auth_admin";

grant references on table "public"."coalitions" to "supabase_auth_admin";

grant select on table "public"."coalitions" to "supabase_auth_admin";

grant trigger on table "public"."coalitions" to "supabase_auth_admin";

grant truncate on table "public"."coalitions" to "supabase_auth_admin";

grant update on table "public"."coalitions" to "supabase_auth_admin";

grant delete on table "public"."comments" to "supabase_auth_admin";

grant insert on table "public"."comments" to "supabase_auth_admin";

grant references on table "public"."comments" to "supabase_auth_admin";

grant select on table "public"."comments" to "supabase_auth_admin";

grant trigger on table "public"."comments" to "supabase_auth_admin";

grant truncate on table "public"."comments" to "supabase_auth_admin";

grant update on table "public"."comments" to "supabase_auth_admin";

grant delete on table "public"."debate_evaluations" to "supabase_auth_admin";

grant insert on table "public"."debate_evaluations" to "supabase_auth_admin";

grant references on table "public"."debate_evaluations" to "supabase_auth_admin";

grant select on table "public"."debate_evaluations" to "supabase_auth_admin";

grant trigger on table "public"."debate_evaluations" to "supabase_auth_admin";

grant truncate on table "public"."debate_evaluations" to "supabase_auth_admin";

grant update on table "public"."debate_evaluations" to "supabase_auth_admin";

grant delete on table "public"."debates" to "supabase_auth_admin";

grant insert on table "public"."debates" to "supabase_auth_admin";

grant references on table "public"."debates" to "supabase_auth_admin";

grant select on table "public"."debates" to "supabase_auth_admin";

grant trigger on table "public"."debates" to "supabase_auth_admin";

grant truncate on table "public"."debates" to "supabase_auth_admin";

grant update on table "public"."debates" to "supabase_auth_admin";

grant delete on table "public"."districts" to "supabase_auth_admin";

grant insert on table "public"."districts" to "supabase_auth_admin";

grant references on table "public"."districts" to "supabase_auth_admin";

grant select on table "public"."districts" to "supabase_auth_admin";

grant trigger on table "public"."districts" to "supabase_auth_admin";

grant truncate on table "public"."districts" to "supabase_auth_admin";

grant update on table "public"."districts" to "supabase_auth_admin";

grant delete on table "public"."electability_scores" to "supabase_auth_admin";

grant insert on table "public"."electability_scores" to "supabase_auth_admin";

grant references on table "public"."electability_scores" to "supabase_auth_admin";

grant select on table "public"."electability_scores" to "supabase_auth_admin";

grant trigger on table "public"."electability_scores" to "supabase_auth_admin";

grant truncate on table "public"."electability_scores" to "supabase_auth_admin";

grant update on table "public"."electability_scores" to "supabase_auth_admin";

grant delete on table "public"."election_questions" to "supabase_auth_admin";

grant insert on table "public"."election_questions" to "supabase_auth_admin";

grant references on table "public"."election_questions" to "supabase_auth_admin";

grant select on table "public"."election_questions" to "supabase_auth_admin";

grant trigger on table "public"."election_questions" to "supabase_auth_admin";

grant truncate on table "public"."election_questions" to "supabase_auth_admin";

grant update on table "public"."election_questions" to "supabase_auth_admin";

grant delete on table "public"."election_requirements" to "supabase_auth_admin";

grant insert on table "public"."election_requirements" to "supabase_auth_admin";

grant references on table "public"."election_requirements" to "supabase_auth_admin";

grant select on table "public"."election_requirements" to "supabase_auth_admin";

grant trigger on table "public"."election_requirements" to "supabase_auth_admin";

grant truncate on table "public"."election_requirements" to "supabase_auth_admin";

grant update on table "public"."election_requirements" to "supabase_auth_admin";

grant delete on table "public"."elections" to "supabase_auth_admin";

grant insert on table "public"."elections" to "supabase_auth_admin";

grant references on table "public"."elections" to "supabase_auth_admin";

grant select on table "public"."elections" to "supabase_auth_admin";

grant trigger on table "public"."elections" to "supabase_auth_admin";

grant truncate on table "public"."elections" to "supabase_auth_admin";

grant update on table "public"."elections" to "supabase_auth_admin";

grant delete on table "public"."escrow_pledges" to "supabase_auth_admin";

grant insert on table "public"."escrow_pledges" to "supabase_auth_admin";

grant references on table "public"."escrow_pledges" to "supabase_auth_admin";

grant select on table "public"."escrow_pledges" to "supabase_auth_admin";

grant trigger on table "public"."escrow_pledges" to "supabase_auth_admin";

grant truncate on table "public"."escrow_pledges" to "supabase_auth_admin";

grant update on table "public"."escrow_pledges" to "supabase_auth_admin";

grant delete on table "public"."gear_items" to "anon";

grant insert on table "public"."gear_items" to "anon";

grant references on table "public"."gear_items" to "anon";

grant select on table "public"."gear_items" to "anon";

grant trigger on table "public"."gear_items" to "anon";

grant truncate on table "public"."gear_items" to "anon";

grant update on table "public"."gear_items" to "anon";

grant delete on table "public"."gear_items" to "authenticated";

grant insert on table "public"."gear_items" to "authenticated";

grant references on table "public"."gear_items" to "authenticated";

grant select on table "public"."gear_items" to "authenticated";

grant trigger on table "public"."gear_items" to "authenticated";

grant truncate on table "public"."gear_items" to "authenticated";

grant update on table "public"."gear_items" to "authenticated";

grant delete on table "public"."gear_items" to "service_role";

grant insert on table "public"."gear_items" to "service_role";

grant references on table "public"."gear_items" to "service_role";

grant select on table "public"."gear_items" to "service_role";

grant trigger on table "public"."gear_items" to "service_role";

grant truncate on table "public"."gear_items" to "service_role";

grant update on table "public"."gear_items" to "service_role";

grant delete on table "public"."gear_items" to "supabase_auth_admin";

grant insert on table "public"."gear_items" to "supabase_auth_admin";

grant references on table "public"."gear_items" to "supabase_auth_admin";

grant select on table "public"."gear_items" to "supabase_auth_admin";

grant trigger on table "public"."gear_items" to "supabase_auth_admin";

grant truncate on table "public"."gear_items" to "supabase_auth_admin";

grant update on table "public"."gear_items" to "supabase_auth_admin";

grant delete on table "public"."jury_appeals" to "supabase_auth_admin";

grant insert on table "public"."jury_appeals" to "supabase_auth_admin";

grant references on table "public"."jury_appeals" to "supabase_auth_admin";

grant select on table "public"."jury_appeals" to "supabase_auth_admin";

grant trigger on table "public"."jury_appeals" to "supabase_auth_admin";

grant truncate on table "public"."jury_appeals" to "supabase_auth_admin";

grant update on table "public"."jury_appeals" to "supabase_auth_admin";

grant delete on table "public"."match_stats" to "anon";

grant insert on table "public"."match_stats" to "anon";

grant references on table "public"."match_stats" to "anon";

grant select on table "public"."match_stats" to "anon";

grant trigger on table "public"."match_stats" to "anon";

grant truncate on table "public"."match_stats" to "anon";

grant update on table "public"."match_stats" to "anon";

grant delete on table "public"."match_stats" to "authenticated";

grant insert on table "public"."match_stats" to "authenticated";

grant references on table "public"."match_stats" to "authenticated";

grant select on table "public"."match_stats" to "authenticated";

grant trigger on table "public"."match_stats" to "authenticated";

grant truncate on table "public"."match_stats" to "authenticated";

grant update on table "public"."match_stats" to "authenticated";

grant delete on table "public"."match_stats" to "service_role";

grant insert on table "public"."match_stats" to "service_role";

grant references on table "public"."match_stats" to "service_role";

grant select on table "public"."match_stats" to "service_role";

grant trigger on table "public"."match_stats" to "service_role";

grant truncate on table "public"."match_stats" to "service_role";

grant update on table "public"."match_stats" to "service_role";

grant delete on table "public"."match_stats" to "supabase_auth_admin";

grant insert on table "public"."match_stats" to "supabase_auth_admin";

grant references on table "public"."match_stats" to "supabase_auth_admin";

grant select on table "public"."match_stats" to "supabase_auth_admin";

grant trigger on table "public"."match_stats" to "supabase_auth_admin";

grant truncate on table "public"."match_stats" to "supabase_auth_admin";

grant update on table "public"."match_stats" to "supabase_auth_admin";

grant delete on table "public"."matches" to "anon";

grant insert on table "public"."matches" to "anon";

grant references on table "public"."matches" to "anon";

grant select on table "public"."matches" to "anon";

grant trigger on table "public"."matches" to "anon";

grant truncate on table "public"."matches" to "anon";

grant update on table "public"."matches" to "anon";

grant delete on table "public"."matches" to "authenticated";

grant insert on table "public"."matches" to "authenticated";

grant references on table "public"."matches" to "authenticated";

grant select on table "public"."matches" to "authenticated";

grant trigger on table "public"."matches" to "authenticated";

grant truncate on table "public"."matches" to "authenticated";

grant update on table "public"."matches" to "authenticated";

grant delete on table "public"."matches" to "service_role";

grant insert on table "public"."matches" to "service_role";

grant references on table "public"."matches" to "service_role";

grant select on table "public"."matches" to "service_role";

grant trigger on table "public"."matches" to "service_role";

grant truncate on table "public"."matches" to "service_role";

grant update on table "public"."matches" to "service_role";

grant delete on table "public"."matches" to "supabase_auth_admin";

grant insert on table "public"."matches" to "supabase_auth_admin";

grant references on table "public"."matches" to "supabase_auth_admin";

grant select on table "public"."matches" to "supabase_auth_admin";

grant trigger on table "public"."matches" to "supabase_auth_admin";

grant truncate on table "public"."matches" to "supabase_auth_admin";

grant update on table "public"."matches" to "supabase_auth_admin";

grant delete on table "public"."offers" to "anon";

grant insert on table "public"."offers" to "anon";

grant references on table "public"."offers" to "anon";

grant select on table "public"."offers" to "anon";

grant trigger on table "public"."offers" to "anon";

grant truncate on table "public"."offers" to "anon";

grant update on table "public"."offers" to "anon";

grant delete on table "public"."offers" to "authenticated";

grant insert on table "public"."offers" to "authenticated";

grant references on table "public"."offers" to "authenticated";

grant select on table "public"."offers" to "authenticated";

grant trigger on table "public"."offers" to "authenticated";

grant truncate on table "public"."offers" to "authenticated";

grant update on table "public"."offers" to "authenticated";

grant delete on table "public"."offers" to "service_role";

grant insert on table "public"."offers" to "service_role";

grant references on table "public"."offers" to "service_role";

grant select on table "public"."offers" to "service_role";

grant trigger on table "public"."offers" to "service_role";

grant truncate on table "public"."offers" to "service_role";

grant update on table "public"."offers" to "service_role";

grant delete on table "public"."offers" to "supabase_auth_admin";

grant insert on table "public"."offers" to "supabase_auth_admin";

grant references on table "public"."offers" to "supabase_auth_admin";

grant select on table "public"."offers" to "supabase_auth_admin";

grant trigger on table "public"."offers" to "supabase_auth_admin";

grant truncate on table "public"."offers" to "supabase_auth_admin";

grant update on table "public"."offers" to "supabase_auth_admin";

grant delete on table "public"."player_combines" to "anon";

grant insert on table "public"."player_combines" to "anon";

grant references on table "public"."player_combines" to "anon";

grant select on table "public"."player_combines" to "anon";

grant trigger on table "public"."player_combines" to "anon";

grant truncate on table "public"."player_combines" to "anon";

grant update on table "public"."player_combines" to "anon";

grant delete on table "public"."player_combines" to "authenticated";

grant insert on table "public"."player_combines" to "authenticated";

grant references on table "public"."player_combines" to "authenticated";

grant select on table "public"."player_combines" to "authenticated";

grant trigger on table "public"."player_combines" to "authenticated";

grant truncate on table "public"."player_combines" to "authenticated";

grant update on table "public"."player_combines" to "authenticated";

grant delete on table "public"."player_combines" to "service_role";

grant insert on table "public"."player_combines" to "service_role";

grant references on table "public"."player_combines" to "service_role";

grant select on table "public"."player_combines" to "service_role";

grant trigger on table "public"."player_combines" to "service_role";

grant truncate on table "public"."player_combines" to "service_role";

grant update on table "public"."player_combines" to "service_role";

grant delete on table "public"."player_combines" to "supabase_auth_admin";

grant insert on table "public"."player_combines" to "supabase_auth_admin";

grant references on table "public"."player_combines" to "supabase_auth_admin";

grant select on table "public"."player_combines" to "supabase_auth_admin";

grant trigger on table "public"."player_combines" to "supabase_auth_admin";

grant truncate on table "public"."player_combines" to "supabase_auth_admin";

grant update on table "public"."player_combines" to "supabase_auth_admin";

grant delete on table "public"."pledges" to "supabase_auth_admin";

grant insert on table "public"."pledges" to "supabase_auth_admin";

grant references on table "public"."pledges" to "supabase_auth_admin";

grant select on table "public"."pledges" to "supabase_auth_admin";

grant trigger on table "public"."pledges" to "supabase_auth_admin";

grant truncate on table "public"."pledges" to "supabase_auth_admin";

grant update on table "public"."pledges" to "supabase_auth_admin";

grant delete on table "public"."profiles" to "supabase_auth_admin";

grant insert on table "public"."profiles" to "supabase_auth_admin";

grant references on table "public"."profiles" to "supabase_auth_admin";

grant select on table "public"."profiles" to "supabase_auth_admin";

grant trigger on table "public"."profiles" to "supabase_auth_admin";

grant truncate on table "public"."profiles" to "supabase_auth_admin";

grant update on table "public"."profiles" to "supabase_auth_admin";

grant delete on table "public"."squad_contracts" to "anon";

grant insert on table "public"."squad_contracts" to "anon";

grant references on table "public"."squad_contracts" to "anon";

grant select on table "public"."squad_contracts" to "anon";

grant trigger on table "public"."squad_contracts" to "anon";

grant truncate on table "public"."squad_contracts" to "anon";

grant update on table "public"."squad_contracts" to "anon";

grant delete on table "public"."squad_contracts" to "authenticated";

grant insert on table "public"."squad_contracts" to "authenticated";

grant references on table "public"."squad_contracts" to "authenticated";

grant select on table "public"."squad_contracts" to "authenticated";

grant trigger on table "public"."squad_contracts" to "authenticated";

grant truncate on table "public"."squad_contracts" to "authenticated";

grant update on table "public"."squad_contracts" to "authenticated";

grant delete on table "public"."squad_contracts" to "service_role";

grant insert on table "public"."squad_contracts" to "service_role";

grant references on table "public"."squad_contracts" to "service_role";

grant select on table "public"."squad_contracts" to "service_role";

grant trigger on table "public"."squad_contracts" to "service_role";

grant truncate on table "public"."squad_contracts" to "service_role";

grant update on table "public"."squad_contracts" to "service_role";

grant delete on table "public"."squad_contracts" to "supabase_auth_admin";

grant insert on table "public"."squad_contracts" to "supabase_auth_admin";

grant references on table "public"."squad_contracts" to "supabase_auth_admin";

grant select on table "public"."squad_contracts" to "supabase_auth_admin";

grant trigger on table "public"."squad_contracts" to "supabase_auth_admin";

grant truncate on table "public"."squad_contracts" to "supabase_auth_admin";

grant update on table "public"."squad_contracts" to "supabase_auth_admin";

grant delete on table "public"."team_contracts" to "anon";

grant insert on table "public"."team_contracts" to "anon";

grant references on table "public"."team_contracts" to "anon";

grant select on table "public"."team_contracts" to "anon";

grant trigger on table "public"."team_contracts" to "anon";

grant truncate on table "public"."team_contracts" to "anon";

grant update on table "public"."team_contracts" to "anon";

grant delete on table "public"."team_contracts" to "authenticated";

grant insert on table "public"."team_contracts" to "authenticated";

grant references on table "public"."team_contracts" to "authenticated";

grant select on table "public"."team_contracts" to "authenticated";

grant trigger on table "public"."team_contracts" to "authenticated";

grant truncate on table "public"."team_contracts" to "authenticated";

grant update on table "public"."team_contracts" to "authenticated";

grant delete on table "public"."team_contracts" to "service_role";

grant insert on table "public"."team_contracts" to "service_role";

grant references on table "public"."team_contracts" to "service_role";

grant select on table "public"."team_contracts" to "service_role";

grant trigger on table "public"."team_contracts" to "service_role";

grant truncate on table "public"."team_contracts" to "service_role";

grant update on table "public"."team_contracts" to "service_role";

grant delete on table "public"."team_contracts" to "supabase_auth_admin";

grant insert on table "public"."team_contracts" to "supabase_auth_admin";

grant references on table "public"."team_contracts" to "supabase_auth_admin";

grant select on table "public"."team_contracts" to "supabase_auth_admin";

grant trigger on table "public"."team_contracts" to "supabase_auth_admin";

grant truncate on table "public"."team_contracts" to "supabase_auth_admin";

grant update on table "public"."team_contracts" to "supabase_auth_admin";

grant delete on table "public"."tier2_verifications" to "supabase_auth_admin";

grant insert on table "public"."tier2_verifications" to "supabase_auth_admin";

grant references on table "public"."tier2_verifications" to "supabase_auth_admin";

grant select on table "public"."tier2_verifications" to "supabase_auth_admin";

grant trigger on table "public"."tier2_verifications" to "supabase_auth_admin";

grant truncate on table "public"."tier2_verifications" to "supabase_auth_admin";

grant update on table "public"."tier2_verifications" to "supabase_auth_admin";

grant delete on table "public"."trades" to "anon";

grant insert on table "public"."trades" to "anon";

grant references on table "public"."trades" to "anon";

grant select on table "public"."trades" to "anon";

grant trigger on table "public"."trades" to "anon";

grant truncate on table "public"."trades" to "anon";

grant update on table "public"."trades" to "anon";

grant delete on table "public"."trades" to "authenticated";

grant insert on table "public"."trades" to "authenticated";

grant references on table "public"."trades" to "authenticated";

grant select on table "public"."trades" to "authenticated";

grant trigger on table "public"."trades" to "authenticated";

grant truncate on table "public"."trades" to "authenticated";

grant update on table "public"."trades" to "authenticated";

grant delete on table "public"."trades" to "service_role";

grant insert on table "public"."trades" to "service_role";

grant references on table "public"."trades" to "service_role";

grant select on table "public"."trades" to "service_role";

grant trigger on table "public"."trades" to "service_role";

grant truncate on table "public"."trades" to "service_role";

grant update on table "public"."trades" to "service_role";

grant delete on table "public"."trades" to "supabase_auth_admin";

grant insert on table "public"."trades" to "supabase_auth_admin";

grant references on table "public"."trades" to "supabase_auth_admin";

grant select on table "public"."trades" to "supabase_auth_admin";

grant trigger on table "public"."trades" to "supabase_auth_admin";

grant truncate on table "public"."trades" to "supabase_auth_admin";

grant update on table "public"."trades" to "supabase_auth_admin";

grant delete on table "public"."user_stances" to "supabase_auth_admin";

grant insert on table "public"."user_stances" to "supabase_auth_admin";

grant references on table "public"."user_stances" to "supabase_auth_admin";

grant select on table "public"."user_stances" to "supabase_auth_admin";

grant trigger on table "public"."user_stances" to "supabase_auth_admin";

grant truncate on table "public"."user_stances" to "supabase_auth_admin";

grant update on table "public"."user_stances" to "supabase_auth_admin";

grant delete on table "public"."users" to "supabase_auth_admin";

grant insert on table "public"."users" to "supabase_auth_admin";

grant references on table "public"."users" to "supabase_auth_admin";

grant select on table "public"."users" to "supabase_auth_admin";

grant trigger on table "public"."users" to "supabase_auth_admin";

grant truncate on table "public"."users" to "supabase_auth_admin";

grant update on table "public"."users" to "supabase_auth_admin";

grant delete on table "public"."votes" to "supabase_auth_admin";

grant insert on table "public"."votes" to "supabase_auth_admin";

grant references on table "public"."votes" to "supabase_auth_admin";

grant select on table "public"."votes" to "supabase_auth_admin";

grant trigger on table "public"."votes" to "supabase_auth_admin";

grant truncate on table "public"."votes" to "supabase_auth_admin";

grant update on table "public"."votes" to "supabase_auth_admin";


  create policy "Public Read Clubs"
  on "public"."clubs"
  as permissive
  for select
  to public
using (true);



  create policy "Users Can Create Club"
  on "public"."clubs"
  as permissive
  for insert
  to public
with check ((auth.uid() = manager_id));



  create policy "Allow public insert access"
  on "public"."matches"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow public read access"
  on "public"."matches"
  as permissive
  for select
  to public
using (true);



  create policy "Managers Send Offers"
  on "public"."offers"
  as permissive
  for insert
  to public
with check ((auth.uid() = manager_id));



  create policy "Managers and Players View Offers"
  on "public"."offers"
  as permissive
  for select
  to public
using (((auth.uid() = manager_id) OR (auth.uid() = player_id)));



  create policy "Players Respond Offers"
  on "public"."offers"
  as permissive
  for update
  to public
using ((auth.uid() = player_id));



  create policy "Public Read Contracts"
  on "public"."squad_contracts"
  as permissive
  for select
  to public
using (true);



