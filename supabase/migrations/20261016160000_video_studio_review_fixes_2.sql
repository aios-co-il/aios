-- Video Studio review fixes, round 2. Additive and safe to re-run.
--
-- 1. claim_video_run fails a run abandoned with no attempts left; a production waiting on that
--    run never advanced, so it stayed "running" and the studio kept "הפק סרט" disabled.
--    Each affected project now advances (assembles what it has, or finishes as failed).
-- 2. The film uses every scene's current clip (approving clips is no longer a step); the video
--    director skin still said "approved clips only". Its wording now matches.

create or replace function public.claim_video_run(p_kinds text[], p_worker text default null)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_abandoned record;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'claim_video_run: service role only' using errcode = '42501';
  end if;

  -- Out of attempts: fail the run, free its scene, and move its production on.
  for v_abandoned in
    update public.marketing_runs as stale
       set status = 'failed',
           finished_at = now(),
           error = 'worker stopped during the job (no attempts left)'
     where stale.status = 'running'
       and stale.kind = any(p_kinds)
       and stale.started_at < now() - interval '45 minutes'
       and stale.attempts >= 3
    returning stale.item_id, stale.scene_id, stale.kind
  loop
    if v_abandoned.kind = 'clip' and v_abandoned.scene_id is not null then
      update public.marketing_video_scenes
         set status = 'failed'
       where id = v_abandoned.scene_id
         and status = 'clip_generating';
    end if;
    if v_abandoned.item_id is not null
       and v_abandoned.kind in ('clip', 'voice', 'music', 'render') then
      perform public.advance_video_production(v_abandoned.item_id);
    end if;
  end loop;

  return query
  update public.marketing_runs as run
     set status = 'running',
         started_at = now(),
         attempts = run.attempts + 1,
         output = run.output || jsonb_strip_nulls(jsonb_build_object('worker', p_worker))
   where run.id = (
     select waiting.id
       from public.marketing_runs as waiting
      where waiting.kind = any(p_kinds)
        and (
          waiting.status = 'queued'
          or (waiting.status = 'running'
              and waiting.started_at < now() - interval '45 minutes'
              and waiting.attempts < 3)
        )
      order by waiting.created_at
      limit 1
      for update skip locked
   )
  returning run.*;
end;
$$;

grant execute on function public.claim_video_run(text[], text) to service_role;

update public.ai_skills
   set constraints = replace(
         constraints,
         'הרכבה רק מסצנות בסטטוס clip_approved.',
         'ההרכבה לוקחת את הקליפ הנוכחי של כל סצנה.'
       ),
       system_prompt = replace(
         replace(
           replace(system_prompt,
             'הסבירי אילו סצנות מאושרות, כמה זמן הסרט',
             'הסבירי לאילו סצנות יש קליפ, כמה זמן הסרט'),
           'הפונקציה לוקחת רק קליפים מאושרים.',
           'הפונקציה לוקחת את הקליפ הנוכחי של כל סצנה; סצנה בלי קליפ לא נכנסת.'),
         '2. אשרי שיש קליפים מאושרים.',
         '2. ודאי שלסצנות יש קליפים.'),
       description = 'קריאת סטוריבורד וידאו והרכבת סרט מהקליפ הנוכחי של כל סצנה.',
       goal = 'להרכיב סרטון פרומו מהסצנות שיש להן קליפ, בלי חיוב ובלי פרסום.',
       steps = replace(steps, '2. אשרי שיש קליפים מאושרים.', '2. ודאי שלסצנות יש קליפים.')
 where slug = 'video_director'
   and scope = 'global';
