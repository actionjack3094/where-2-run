-- Latest structured mediation result for a channel.
-- Written by the mediate server action after generateObject validates the model output.

alter table public.mediation_channels
  add column if not exists latest_resolution jsonb;

alter table public.mediation_channels
  drop constraint if exists mediation_channels_latest_resolution_object_check;

alter table public.mediation_channels
  add constraint mediation_channels_latest_resolution_object_check
  check (
    latest_resolution is null
    or (
      jsonb_typeof(latest_resolution) = 'object'
      and latest_resolution ? 'tone'
      and latest_resolution ? 'friction_points'
      and latest_resolution ? 'proposed_compromise'
      and latest_resolution ? 'needs_cooldown'
      and jsonb_typeof(latest_resolution -> 'friction_points') = 'array'
      and jsonb_typeof(latest_resolution -> 'needs_cooldown') = 'boolean'
    )
  );

comment on column public.mediation_channels.latest_resolution is
  'Latest generateObject resolution: tone, friction_points, proposed_compromise, needs_cooldown.';
