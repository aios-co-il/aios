-- Video Studio: the storyboard chooses the scene engine and queues voice or music.
-- Replaces queue_video_clips so each clip run records the engine the user picked.
-- No existing row is changed. Paid engines stay idle until a project selects them.

drop function if exists public.queue_video_clips(uuid, uuid[], text, jsonb, uuid);

create or replace function public.queue_video_clips(
  p_item_id uuid,
  p_scene_ids uuid[],
  p_aspect text default '9:16',
  p_estimate jsonb default '{}'::jsonb,
  p_stage_id uuid default null,
  p_provider text default 'mock',
  p_generate_audio boolean default false
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
  if p_provider not in ('mock', 'kling', 'elevenlabs', 'higgsfield') then
    raise exception 'queue_video_clips: unknown provider %', p_provider using errcode = '22023';
  end if;
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
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
    select
      picked.tenant_id,
      p_item_id,
      v_stage,
      'clip',
      picked.id,
      'queued',
      p_provider,
      jsonb_build_object(
        'scene_id', picked.id,
        'client_id', v_item.client_id,
        'still_url', picked.still_url,
        'still_asset_id', picked.still_asset_id,
        'motion_prompt', picked.motion_prompt,
        'duration_s', picked.duration_s,
        'aspect', p_aspect,
        'provider', p_provider,
        'generate_audio', coalesce(p_generate_audio, false),
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

grant execute on function public.queue_video_clips(uuid, uuid[], text, jsonb, uuid, text, boolean) to authenticated, service_role;

create or replace function public.queue_video_sound(
  p_item_id uuid,
  p_kind text,
  p_scene_ids uuid[] default '{}'::uuid[],
  p_provider text default 'elevenlabs',
  p_estimate jsonb default '{}'::jsonb,
  p_stage_id uuid default null,
  p_prompt text default null,
  p_voice_id text default null
)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_stage uuid;
  v_seconds numeric;
begin
  if p_kind not in ('voice', 'music') then
    raise exception 'queue_video_sound: kind must be voice or music' using errcode = '22023';
  end if;
  if p_provider <> 'elevenlabs' then
    raise exception 'queue_video_sound: sound provider must be elevenlabs' using errcode = '22023';
  end if;
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'queue_video_sound: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  v_stage := coalesce(p_stage_id, v_item.current_stage_id);
  if v_stage is null then
    raise exception 'queue_video_sound: work item % has no stage', p_item_id using errcode = '22023';
  end if;

  if p_kind = 'music' then
    if exists (
      select 1 from public.marketing_runs
       where item_id = p_item_id and kind = 'music' and status in ('queued', 'running')
    ) then
      return;
    end if;
    select coalesce(sum(duration_s), 0) into v_seconds
      from public.marketing_video_scenes where item_id = p_item_id;
    if v_seconds <= 0 then
      raise exception 'queue_video_sound: the storyboard has no duration' using errcode = '22023';
    end if;
    return query
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
    values (
      v_item.tenant_id,
      p_item_id,
      v_stage,
      'music',
      'queued',
      p_provider,
      jsonb_build_object(
        'client_id', v_item.client_id,
        'prompt', coalesce(nullif(btrim(p_prompt), ''), 'Instrumental commercial bed, no vocals, no lyrics.'),
        'music_length_ms', least(greatest(round(v_seconds * 1000), 3000), 300000),
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    )
    returning *;
    return;
  end if;

  return query
  with picked as (
    select scene.*
      from public.marketing_video_scenes as scene
     where scene.item_id = p_item_id
       and scene.id = any(p_scene_ids)
       and btrim(scene.voiceover_text) <> ''
       and not exists (
         select 1 from public.marketing_runs as active
          where active.scene_id = scene.id
            and active.kind = 'voice'
            and active.status in ('queued', 'running')
       )
     for update of scene
  )
  insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
  select
    picked.tenant_id,
    p_item_id,
    v_stage,
    'voice',
    picked.id,
    'queued',
    p_provider,
    jsonb_build_object(
      'scene_id', picked.id,
      'client_id', v_item.client_id,
      'voiceover_text', btrim(picked.voiceover_text),
      'voice_id', nullif(btrim(coalesce(p_voice_id, '')), ''),
      'estimate', coalesce(p_estimate, '{}'::jsonb)
    )
  from picked
  returning *;
end;
$$;

grant execute on function public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text) to authenticated, service_role;
