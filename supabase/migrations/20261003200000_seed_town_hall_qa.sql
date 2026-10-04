-- Town Hall seed for the concluded Zoning Preemption debate.
-- Jordan Hale asks. James Harlan, seated on the local-control side, answers.

do $seed$
declare
  v_debate uuid;
  v_voter uuid;
  v_harlan uuid;
  v_question uuid := '7a110001-0001-4000-8000-000000000001';
  v_answer uuid := '7a110001-0002-4000-8000-000000000002';
  v_existing_question uuid;
  v_existing_answer uuid;
  v_question_text text := 'If we maintain the current local zoning vetoes, how do you plan to stop middle-class families from being completely priced out of the Austin market within the next 5 years?';
  v_answer_text text := 'Displacing local control to the state level strips neighborhoods of their voice, but I agree the status quo is failing. The solution isn''t a blanket override; it''s streamlining the permitting office to reduce the 12-month backlog, and expanding transit corridors where density is actually supported by infrastructure.';
begin
  select d.id, d.candidate_a_id
  into v_debate, v_harlan
  from public.arena_debates as d
  join public.debate_prompts as prompt on prompt.id = d.prompt_id
  join public.community_prompts as source on source.id = prompt.source_prompt_id
  join public.profiles as candidate on candidate.id = d.candidate_a_id
  where source.title = 'Zoning Preemption'
    and d.status = 'concluded'
    and (
      candidate.id = 'b07a0001-0002-4000-8000-000000000002'
      or candidate.synthetic_key = 'blue-dog'
      or candidate.display_name = 'James Harlan'
      or candidate.full_name = 'James Harlan'
    )
  order by (d.id = 'a4e40001-0005-4000-8000-000000000005') desc, d.created_at desc
  limit 1;

  if v_debate is null then
    raise exception 'Concluded Zoning Preemption debate with James Harlan is missing. Apply 20261003190000_seed_agenda_queue.sql first.';
  end if;

  select id into v_voter
  from public.profiles
  where id = 'a07e0001-0001-4000-8000-000000000001'
     or email = 'jordan.hale@seed.where2run.local'
     or display_name = 'Jordan Hale'
     or full_name = 'Jordan Hale'
  order by (id = 'a07e0001-0001-4000-8000-000000000001') desc
  limit 1;

  if v_voter is null then
    raise exception 'Jordan Hale is not on profiles. Apply supabase/seed.sql before this migration.';
  end if;

  update public.profiles
  set is_verified = true, updated_at = now()
  where id = v_voter
    and is_verified = false;

  select id into v_existing_question
  from public.constituent_questions
  where id = v_question
     or (debate_id = v_debate and voter_id = v_voter)
  order by (id = v_question) desc
  limit 1;

  if v_existing_question is null then
    insert into public.constituent_questions (id, debate_id, voter_id, content)
    values (v_question, v_debate, v_voter, v_question_text);
  else
    update public.constituent_questions
    set
      debate_id = v_debate,
      voter_id = v_voter,
      content = v_question_text
    where id = v_existing_question;
    v_question := v_existing_question;
  end if;

  select id into v_existing_answer
  from public.candidate_answers
  where id = v_answer
     or (question_id = v_question and candidate_id = v_harlan)
  order by (id = v_answer) desc
  limit 1;

  if v_existing_answer is null then
    insert into public.candidate_answers (id, question_id, candidate_id, content)
    values (v_answer, v_question, v_harlan, v_answer_text);
  else
    update public.candidate_answers
    set
      question_id = v_question,
      candidate_id = v_harlan,
      content = v_answer_text
    where id = v_existing_answer;
  end if;
end
$seed$;

notify pgrst, 'reload schema';
