-- Video Studio phase 4: queue image-to-video clips for the render worker.
-- One call queues every requested scene that has a still and no clip run in flight, marks
-- those scenes clip_generating and returns the queued runs. The estimate the user approved
-- is stored on each run so the worker and the cost report can compare it with the real cost.

create or replace function public.queue_video_clips(
  p_item_id uuid,
  p_scene_ids uuid[],
  p_aspect text default '9:16',
  p_estimate jsonb default '{}'::jsonb,
  p_stage_id uuid default null
)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_stage uuid;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'queue_video_clips: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  v_stage := coalesce(p_stage_id, v_item.current_stage_id);
  if v_stage is null then
    raise exception 'queue_video_clips: work item % has no stage', p_item_id using errcode = '22023';
  end if;
  if p_aspect not in ('9:16', '16:9', '1:1', '4:5') then
    raise exception 'queue_video_clips: unsupported aspect %', p_aspect using errcode = '22023';
  end if;

  return query
  with picked as (
    select scene.*, still.url as still_url
      from public.marketing_video_scenes as scene
      join public.marketing_assets as still on still.id = scene.still_asset_id
     where scene.item_id = p_item_id
       and scene.id = any(p_scene_ids)
       and coalesce(still.url, '') <> ''
       and not exists (
         select 1 from public.marketing_runs as active
          where active.scene_id = scene.id
            and active.kind = 'clip'
            and active.status in ('queued', 'running')
       )
     for update of scene
  ),
  queued as (
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, input)
    select
      picked.tenant_id,
      p_item_id,
      v_stage,
      'clip',
      picked.id,
      'queued',
      jsonb_build_object(
        'scene_id', picked.id,
        'client_id', v_item.client_id,
        'still_url', picked.still_url,
        'still_asset_id', picked.still_asset_id,
        'motion_prompt', picked.motion_prompt,
        'duration_s', picked.duration_s,
        'aspect', p_aspect,
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    from picked
    returning *
  ),
  marked as (
    update public.marketing_video_scenes as scene
       set status = 'clip_generating'
      from queued
     where scene.id = queued.scene_id
  )
  select * from queued;
end;
$$;

grant execute on function public.queue_video_clips(uuid, uuid[], text, jsonb, uuid) to authenticated, service_role;

create index if not exists marketing_runs_scene_kind_idx
  on public.marketing_runs (scene_id, kind) where scene_id is not null;
