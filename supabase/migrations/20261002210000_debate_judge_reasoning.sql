-- Paragraph written when the adjudication model declares a concluded match.

alter table public.debates
  add column if not exists judge_reasoning text;

comment on column public.debates.judge_reasoning is
  'One-paragraph competitive-rubric explanation saved when a debate is resolved without a predefined winner.';
