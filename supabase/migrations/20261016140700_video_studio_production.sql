-- Video Studio: one-click production. produce_video queues everything a film still needs
-- (clips for scenes without a current clip, voiceovers whose text changed, a music bed if
-- there is none) and marks the project as producing. The worker calls
-- advance_video_production after every clip, voice and music job; once nothing is left in
-- flight it queues the free ffmpeg assembly, and when that finishes the production is done.
-- The film uses every scene's current clip: approving clips is no longer a step.
-- Additive: no existing row is changed and nothing is removed.

-- Film assembly takes each scene's current clip, approved or not.
create or replace function public.queue_video_render(
  p_item_id uuid,
  p_aspect text default '9:16',
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
  v_scenes jsonb;
  v_music text;
  v_version integer;
begin
  if p_aspect not in ('9:16', '16:9', '1:1', '4:5') then
    raise exception 'queue_video_render: unsupported aspect %', p_aspect using errcode = '22023';
  end if;
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'queue_video_render: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  v_stage := coalesce(p_stage_id, v_item.current_stage_id);
  if v_stage is null then
    raise exception 'queue_video_render: work item % has no stage', p_item_id using errcode = '22023';
  end if;

  if exists (
    select 1 from public.marketing_runs
     where item_id = p_item_id
       and kind = 'render'
       and status in ('queued', 'running')
  ) then
    return;
  end if;

  select coalesce(jsonb_agg(row_to_json(picked)::jsonb order by picked.position), '[]'::jsonb)
    into v_scenes
    from (
      select
        scene.id,
        scene.position,
        scene.overlay_text as "overlayText",
        scene.duration_s as "durationS",
        clip.url as "clipPath",
        voice.url as "voicePath"
      from public.marketing_video_scenes as scene
      join public.marketing_assets as clip on clip.id = scene.clip_asset_id
      left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
      where scene.item_id = p_item_id
        and scene.tenant_id = v_item.tenant_id
        and coalesce(clip.url, '') <> ''
      order by scene.position
    ) as picked;

  if jsonb_array_length(v_scenes) = 0 then
    raise exception 'queue_video_render: no approved clips' using errcode = '22023';
  end if;

  select url into v_music
    from public.marketing_assets
   where item_id = p_item_id
     and tenant_id = v_item.tenant_id
     and type = 'music'
     and coalesce(url, '') <> ''
   order by created_at desc
   limit 1;

  select count(*) + 1 into v_version
    from public.marketing_assets
   where item_id = p_item_id
     and type = 'render';

  return query
  insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
  values (
    v_item.tenant_id,
    p_item_id,
    v_stage,
    'render',
    'queued',
    'compose',
    jsonb_build_object(
      'client_id', v_item.client_id,
      'aspect', p_aspect,
      'musicPath', v_music,
      'version', v_version,
      'scenes', v_scenes
    )
  )
  on conflict (item_id, kind)
    where scene_id is null and status in ('queued', 'running') and kind in ('music', 'render')
    do nothing
  returning *;
end;
$$;

grant execute on function public.queue_video_render(uuid, text, uuid) to authenticated, service_role;

-- payload.video.production = { status, aspect, started_at, finished_at, render_run_id, error }
create or replace function public.set_video_production(p_item_id uuid, p_patch jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.marketing_work_items
     set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
           'video',
           coalesce(payload->'video', '{}'::jsonb) || jsonb_build_object(
             'production',
             coalesce(payload->'video'->'production', '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
           )
         )
   where id = p_item_id
  returning payload->'video'->'production';
$$;

grant execute on function public.set_video_production(uuid, jsonb) to authenticated, service_role;

/*
 * Moves a production on: waits while clips, voices or music are in flight, then queues the
 * assembly once, then marks it done (or failed) when the assembly finishes. Safe to call
 * any number of times and from concurrent workers: the item row is locked while it runs.
 */
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
  v_run uuid;
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
       and kind in ('clip', 'voice', 'music')
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
    -- An assembly was already in flight; follow that one.
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

/*
 * One click: queue what the film still needs and start the production. Scenes without a
 * still are skipped (the editor makes the stills first). Returns what was queued.
 */
create or replace function public.produce_video(
  p_item_id uuid,
  p_aspect text default '9:16',
  p_provider text default 'mock',
  p_estimate jsonb default '{}'::jsonb,
  p_stage_id uuid default null,
  p_with_voice boolean default true,
  p_with_music boolean default true,
  p_voice_id text default null,
  p_music_prompt text default null,
  p_generate_audio boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_clip_ids uuid[];
  v_voice_ids uuid[];
  v_clips integer := 0;
  v_voices integer := 0;
  v_music integer := 0;
  v_state text;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'produce_video: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  -- A production that has run for over an hour is treated as stuck and may be restarted.
  if coalesce(v_item.payload->'video'->'production'->>'status', '') = 'running'
     and coalesce((v_item.payload->'video'->'production'->>'started_at')::timestamptz, now()) > now() - interval '1 hour' then
    return jsonb_build_object('status', 'running', 'clips', 0, 'voices', 0, 'music', 0);
  end if;

  select coalesce(array_agg(scene.id), '{}'::uuid[]) into v_clip_ids
    from public.marketing_video_scenes as scene
   where scene.item_id = p_item_id
     and scene.still_asset_id is not null
     and (scene.clip_asset_id is null or scene.clip_stale or scene.status = 'failed');

  select coalesce(array_agg(scene.id), '{}'::uuid[]) into v_voice_ids
    from public.marketing_video_scenes as scene
    left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
   where scene.item_id = p_item_id
     and btrim(scene.voiceover_text) <> ''
     and (voice.id is null or coalesce(voice.meta->>'text', '') <> btrim(scene.voiceover_text));

  perform public.set_video_production(p_item_id, jsonb_build_object(
    'status', 'running',
    'aspect', p_aspect,
    'provider', p_provider,
    'started_at', now(),
    'finished_at', null,
    'render_run_id', null,
    'error', null,
    'estimate', coalesce(p_estimate, '{}'::jsonb)
  ));

  if cardinality(v_clip_ids) > 0 then
    select count(*) into v_clips
      from public.queue_video_clips(
        p_item_id, v_clip_ids, p_aspect, coalesce(p_estimate->'clips', '{}'::jsonb),
        p_stage_id, p_provider, p_generate_audio
      );
  end if;

  if p_with_voice and cardinality(v_voice_ids) > 0 then
    select count(*) into v_voices
      from public.queue_video_sound(
        p_item_id, 'voice', v_voice_ids, 'elevenlabs',
        coalesce(p_estimate->'voice', '{}'::jsonb), p_stage_id, null, p_voice_id
      );
  end if;

  if p_with_music and not exists (
    select 1 from public.marketing_assets
     where item_id = p_item_id and type = 'music' and coalesce(url, '') <> ''
  ) then
    select count(*) into v_music
      from public.queue_video_sound(
        p_item_id, 'music', '{}'::uuid[], 'elevenlabs',
        coalesce(p_estimate->'music', '{}'::jsonb), p_stage_id, p_music_prompt, null
      );
  end if;

  v_state := public.advance_video_production(p_item_id);
  return jsonb_build_object('status', v_state, 'clips', v_clips, 'voices', v_voices, 'music', v_music);
end;
$$;

grant execute on function public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean)
  to authenticated, service_role;
