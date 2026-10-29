-- PR 932 review #24: a production never raises out of the worker's claim. Safe to re-run.
--
-- queue_video_lipsync raises when the project has no stage, and advance_video_production called
-- it unguarded. claim_video_run moves every abandoned run's production on inside one statement,
-- so that one raise rolled back the whole claim and the worker could claim nothing, for any
-- tenant, until the row was fixed by hand. Three changes, marked "stage guard":
--   1. advance_video_production fails the production with the reason when the lip sync cannot
--      be queued, as it already does when the assembly cannot be queued.
--   2. claim_video_run keeps going when moving one abandoned production on raises anyway (a
--      payload it cannot read): that run stays failed and the error goes to the log.
--   3. workshop_assign_client with no client moves the project to the tenant's "no client"
--      pipeline (as 20261026100300 intended) instead of clearing its stage, so taking a
--      producing film off its client no longer leaves its runs without a stage.
--
-- Replaces (copied from their latest definitions, changes marked "stage guard"):
--   advance_video_production, claim_video_run   (20261026102300_video_lipsync.sql)
--   workshop_assign_client                      (20261026101900_workshop_assign_only_workshop.sql)

-- ── 1. Production: a lip sync that cannot be queued fails the production ──────
create or replace function public.advance_video_production(p_item_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_prod jsonb;
  v_render uuid;
  v_render_status text;
  v_render_error text;
  v_voice_error text;
  v_run uuid;
  v_talk_ids uuid[];
  v_queued integer := 0;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id for update;
  if not found then
    return 'missing';
  end if;
  v_prod := v_item.payload->'video'->'production';
  if coalesce(v_prod->>'status', '') <> 'running' then
    return coalesce(v_prod->>'status', 'idle');
  end if;

  if exists (
    select 1 from public.marketing_runs
     where item_id = p_item_id
       and kind in ('clip', 'voice', 'music', 'lipsync')
       and status in ('queued', 'running')
  ) then
    return 'working';
  end if;

  v_render := nullif(v_prod->>'render_run_id', '')::uuid;
  if v_render is not null then
    select status, error into v_render_status, v_render_error
      from public.marketing_runs where id = v_render;
    if v_render_status in ('queued', 'running') then
      return 'rendering';
    end if;
    perform public.set_video_production(p_item_id, jsonb_build_object(
      'status', case when v_render_status = 'completed' then 'done' else 'failed' end,
      'finished_at', now(),
      'error', case when v_render_status = 'completed' then null else coalesce(v_render_error, 'assembly failed') end
    ));
    return case when v_render_status = 'completed' then 'done' else 'failed' end;
  end if;

  -- lipsync: once the clips are done, a talking scene whose clip does not speak its line
  -- gets its own voice line, then a lip-sync pass. queue_video_lipsync skips what already
  -- failed, so a scene that cannot be lip-synced is assembled as it is (its line as voiceover).
  select coalesce(array_agg(scene.id order by scene.position), '{}'::uuid[])
    into v_talk_ids
    from public.marketing_video_scenes as scene
    cross join lateral (
      select public.video_talking_line(scene.meta, scene.voiceover_text) as line
    ) as l
    left join public.marketing_assets as clip on clip.id = scene.clip_asset_id
   where scene.item_id = p_item_id
     and l.line <> ''
     and scene.still_asset_id is not null
     and not (
       coalesce(clip.meta->>'lipsync', '') = 'true'
       and coalesce(clip.meta->>'dialogue', '') = l.line
     );
  if cardinality(v_talk_ids) > 0 then
    -- stage guard: a lip sync that cannot be queued (the project has no stage) fails the
    -- production with its reason, as the assembly below does, instead of raising.
    begin
      select count(*) into v_queued
        from public.queue_video_lipsync(
          p_item_id, v_talk_ids, coalesce(v_prod->'estimate'->'lipsync', '{}'::jsonb), null, false
        );
    exception when others then
      perform public.set_video_production(p_item_id, jsonb_build_object(
        'status', 'failed',
        'finished_at', now(),
        'error', sqlerrm
      ));
      return 'failed';
    end;
    if v_queued > 0 then
      return 'working';
    end if;
  end if;

  if coalesce((v_prod->>'with_voice')::boolean, false)
     and not public.video_narration_ready(p_item_id) then
    select error into v_voice_error
      from public.marketing_runs
     where item_id = p_item_id and kind = 'voice'
     order by created_at desc
     limit 1;
    perform public.set_video_production(p_item_id, jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'error', coalesce(nullif(v_voice_error, ''), 'narration missing')
    ));
    return 'failed';
  end if;

  begin
    select id into v_run
      from public.queue_video_render(p_item_id, coalesce(v_prod->>'aspect', '9:16'), null)
     limit 1;
  exception when others then
    perform public.set_video_production(p_item_id, jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'error', case when sqlerrm like '%no approved clips%' then 'no clips to assemble' else sqlerrm end
    ));
    return 'failed';
  end;
  if v_run is null then
    select id into v_run
      from public.marketing_runs
     where item_id = p_item_id and kind = 'render' and status in ('queued', 'running')
     order by created_at desc
     limit 1;
  end if;
  perform public.set_video_production(p_item_id, jsonb_build_object('render_run_id', v_run));
  return 'rendering';
end;
$$;

grant execute on function public.advance_video_production(uuid) to authenticated, service_role;

-- ── 2. Claim: one production that cannot move on does not stop the claim ──────
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
       and v_abandoned.kind in ('clip', 'voice', 'music', 'lipsync', 'render') then
      -- stage guard: one production that cannot move on keeps its run failed and is logged;
      -- the claim goes on for every other tenant.
      begin
        perform public.advance_video_production(v_abandoned.item_id);
      exception when others then
        raise warning 'claim_video_run: advance_video_production(%): %', v_abandoned.item_id, sqlerrm;
      end;
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

-- ── 3. Assign: no client means the "no client" pipeline ───────────────────────
create or replace function public.workshop_assign_client(
  p_item_id uuid,
  p_client_id uuid default null
)
returns public.marketing_work_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_pipeline uuid;
  v_stage uuid;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'workshop_assign_client: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  if not (coalesce(v_item.payload, '{}'::jsonb) ? 'workshop') then
    raise exception 'workshop_assign_client: work item % is not a workshop project', p_item_id using errcode = '22023';
  end if;

  -- stage guard: without a client the project moves to the tenant's "no client" pipeline
  -- (workshop_creative_stage with a null client), not to no stage at all.
  select s.pipeline_id, s.stage_id into v_pipeline, v_stage
    from public.workshop_creative_stage(v_item.tenant_id, p_client_id) s;

  update public.marketing_work_items
     set client_id = p_client_id, pipeline_id = v_pipeline, current_stage_id = v_stage
   where id = p_item_id
  returning * into v_item;
  return v_item;
end;
$$;

grant execute on function public.workshop_assign_client(uuid, uuid) to authenticated, service_role;
