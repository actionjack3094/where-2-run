-- Exponential moving average for the 6-axis civic ideology vector.
-- Called at the end of publish-stance after a user files a stance.
-- Paste into the Supabase SQL editor, or apply with `supabase db push`.

create extension if not exists vector;

create or replace function public.update_ideology_vector_ema(
  p_user_id uuid,
  p_stance_vector vector(6),
  p_alpha double precision default 0.25
)
returns vector(6)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_raw vector;
  current_six vector(6);
  next_six vector(6);
  curr double precision[];
  stance double precision[];
  raw_arr double precision[];
  dims integer := 0;
  alpha double precision;
  climate double precision;
  healthcare double precision;
  immigration double precision;
  economy double precision;
  social double precision;
  safety double precision;
  next_ten double precision[];
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  alpha := least(1, greatest(0.01, coalesce(p_alpha, 0.25)));

  select u.ideology_vector
    into current_raw
  from public.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'user not found';
  end if;

  current_six := coalesce(
    public.ideology_to_six_axis(current_raw),
    '[0.5,0.5,0.5,0.5,0.5,0.5]'::vector(6)
  );

  curr := translate(btrim(current_six::text), '[]', '{}')::double precision[];
  stance := translate(btrim(p_stance_vector::text), '[]', '{}')::double precision[];

  climate := least(1, greatest(0, alpha * coalesce(stance[1], 0.5) + (1 - alpha) * coalesce(curr[1], 0.5)));
  healthcare := least(1, greatest(0, alpha * coalesce(stance[2], 0.5) + (1 - alpha) * coalesce(curr[2], 0.5)));
  immigration := least(1, greatest(0, alpha * coalesce(stance[3], 0.5) + (1 - alpha) * coalesce(curr[3], 0.5)));
  economy := least(1, greatest(0, alpha * coalesce(stance[4], 0.5) + (1 - alpha) * coalesce(curr[4], 0.5)));
  social := least(1, greatest(0, alpha * coalesce(stance[5], 0.5) + (1 - alpha) * coalesce(curr[5], 0.5)));
  safety := least(1, greatest(0, alpha * coalesce(stance[6], 0.5) + (1 - alpha) * coalesce(curr[6], 0.5)));

  next_six := array[climate, healthcare, immigration, economy, social, safety]::vector(6);

  if current_raw is not null then
    raw_arr := translate(btrim(current_raw::text), '[]', '{}')::double precision[];
    dims := coalesce(array_length(raw_arr, 1), 0);
  end if;

  if dims = 6 then
    update public.users
    set
      ideology_vector = next_six,
      updated_at = now()
    where id = p_user_id;
  else
    -- Canonical 10-dim layout used by onboarding (buildUserVector).
    next_ten := array[
      climate,
      social,
      1 - immigration,
      1 - safety,
      healthcare,
      social,
      1 - economy,
      1 - safety,
      (climate + economy) / 2,
      economy
    ];
    update public.users
    set
      ideology_vector = next_ten::vector(10),
      updated_at = now()
    where id = p_user_id;
  end if;

  return next_six;
end;
$$;

comment on function public.update_ideology_vector_ema(uuid, vector, double precision) is
  'EMA-updates users.ideology_vector from a 6-axis stance: next = alpha * stance + (1-alpha) * current.';

grant execute on function public.update_ideology_vector_ema(uuid, vector, double precision)
  to authenticated, service_role;

notify pgrst, 'reload schema';
