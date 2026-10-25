-- queue_video_sound re-voices a talking film's narrated scenes when the project's voice changed,
-- the same rule video_narration_ready uses (20261025210000). Without it a new voice queued
-- nothing and the production failed with "narration missing". Same body as
-- 20261025150000_video_lipsync.sql otherwise. Safe to re-run.

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
  v_ids uuid[];
  v_script text;
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
    on conflict (item_id, kind)
      where scene_id is null and status in ('queued', 'running') and kind in ('music', 'render')
    do nothing
    returning *;
    return;
  end if;

  -- lipsync: a talking scene is never part of the narration.
  select coalesce(array_agg(scene.id order by scene.position), '{}'::uuid[]),
         string_agg(public.video_narration_line(scene.meta, scene.voiceover_text), ' ' order by scene.position)
    into v_ids, v_script
    from public.marketing_video_scenes as scene
   where scene.item_id = p_item_id
     and scene.id = any(p_scene_ids)
     and public.video_narration_line(scene.meta, scene.voiceover_text) <> '';
  if coalesce(v_script, '') = '' then
    return;
  end if;

  -- lipsync: with a talking scene in the storyboard, each narrated scene gets its own voice,
  -- played inside that scene, so no narration runs over the character's line.
  if exists (
    select 1 from public.marketing_video_scenes
     where item_id = p_item_id and coalesce(meta->>'lipsync', '') = 'true'
  ) then
    return query
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
    select
      scene.tenant_id,
      p_item_id,
      v_stage,
      'voice',
      scene.id,
      'queued',
      p_provider,
      jsonb_build_object(
        'scene_id', scene.id,
        'client_id', v_item.client_id,
        'voiceover_text', l.line,
        'voice_id', nullif(btrim(coalesce(p_voice_id, '')), ''),
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    from public.marketing_video_scenes as scene
    cross join lateral (
      select public.video_narration_line(scene.meta, scene.voiceover_text) as line
    ) as l
    left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
    where scene.id = any(v_ids)
      and not (
        coalesce(voice.type, '') = 'voiceover'
        and coalesce(voice.meta->>'text', '') = l.line
        -- A voice made in another voice than the project's is made again.
        and public.video_voice_matches(
          voice.meta,
          nullif(btrim(coalesce(v_item.payload->'video'->>'voice_id', '')), '')
        )
      )
    on conflict (scene_id, kind)
      where scene_id is not null and status in ('queued', 'running') and kind in ('clip', 'voice')
    do nothing
    returning *;
    return;
  end if;

  if exists (
    select 1 from public.marketing_runs
     where item_id = p_item_id
       and kind = 'voice'
       and scene_id is null
       and status in ('queued', 'running')
  ) then
    return;
  end if;

  begin
    return query
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
    values (
      v_item.tenant_id,
      p_item_id,
      v_stage,
      'voice',
      'queued',
      p_provider,
      jsonb_build_object(
        'continuous', true,
        'scene_ids', to_jsonb(v_ids),
        'client_id', v_item.client_id,
        'voiceover_text', v_script,
        'voice_id', nullif(btrim(coalesce(p_voice_id, '')), ''),
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    )
    returning *;
  exception when unique_violation then
    return;
  end;
end;
$$;

grant execute on function public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text) to authenticated, service_role;
