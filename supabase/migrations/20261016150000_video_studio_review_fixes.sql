-- Video Studio review fixes. Additive and safe to re-run.
--
-- 1. A worker that dies mid-job left its run 'running' forever: claims only took queued rows,
--    and the one-active-job indexes then blocked a retry of that scene or project. A run
--    running for more than 45 minutes (clips time out after 15) is claimed again; the jobs
--    resume from what they persisted (a clip's provider_job_id, a voice's audio_path), so
--    a reclaim does not pay twice. After the last attempt it is failed instead.
-- 2. A new motion_prompt now marks the existing clip stale, like a new picture does, so
--    "animate all" and the one-click production regenerate it.

create or replace function public.claim_video_run(p_kinds text[], p_worker text default null)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'claim_video_run: service role only' using errcode = '42501';
  end if;

  -- Out of attempts: fail the run and free its scene, so the user can animate it again.
  with abandoned as (
    update public.marketing_runs as stale
       set status = 'failed',
           finished_at = now(),
           error = 'worker stopped during the job (no attempts left)'
     where stale.status = 'running'
       and stale.kind = any(p_kinds)
       and stale.started_at < now() - interval '45 minutes'
       and stale.attempts >= 3
    returning stale.scene_id, stale.kind
  )
  update public.marketing_video_scenes as scene
     set status = 'failed'
    from abandoned
   where abandoned.kind = 'clip'
     and scene.id = abandoned.scene_id
     and scene.status = 'clip_generating';

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

create or replace function public.marketing_video_scenes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if tg_op = 'INSERT' or new.item_id is distinct from old.item_id or new.tenant_id is distinct from old.tenant_id then
    select tenant_id into v_tenant from public.marketing_work_items where id = new.item_id;
    if v_tenant is null or v_tenant <> new.tenant_id then
      raise exception 'marketing_video_scenes: work item % is not in tenant %', new.item_id, new.tenant_id
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.visual_prompt is distinct from old.visual_prompt and new.still_asset_id is not distinct from old.still_asset_id then
      new.status := 'draft';
    end if;
    if new.clip_asset_id is distinct from old.clip_asset_id then
      new.clip_stale := false;
    elsif new.clip_asset_id is not null
      and (new.visual_prompt is distinct from old.visual_prompt
        or new.still_asset_id is distinct from old.still_asset_id
        or new.motion_prompt is distinct from old.motion_prompt) then
      new.clip_stale := true;
    end if;
  end if;

  return new;
end;
$$;
