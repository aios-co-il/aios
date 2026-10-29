-- Workshop film fixes, part 2. Safe to re-run.
-- 1. produce_video redoes free-preview (mock) clips only when the caller asks (p_redo_preview).
--    The workshop prices those clips and asks for it; the Video Studio's plan does not count
--    them, so it keeps the old behaviour and its cost dialog.
-- 2. video_narration_ready accepts a continuous narration only while it reads the current script
--    in order, as the render worker requires; a reordered film is narrated again.

-- ── 1. produce_video(p_redo_preview) ─────────────────────────────────────────
drop function if exists public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean);

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
  p_generate_audio boolean default false,
  p_redo_preview boolean default false
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
  if coalesce(v_item.payload->'video'->'production'->>'status', '') = 'running'
     and coalesce((v_item.payload->'video'->'production'->>'started_at')::timestamptz, now()) > now() - interval '1 hour' then
    return jsonb_build_object('status', 'running', 'clips', 0, 'voices', 0, 'music', 0);
  end if;

  select coalesce(array_agg(scene.id), '{}'::uuid[]) into v_clip_ids
    from public.marketing_video_scenes as scene
    left join public.marketing_assets as clip on clip.id = scene.clip_asset_id
   where scene.item_id = p_item_id
     and scene.still_asset_id is not null
     and (
       scene.clip_asset_id is null or scene.clip_stale or scene.status = 'failed'
       -- A free-preview (mock) clip is animated again on a paid engine, only when the caller
       -- priced it (the workshop does; the Video Studio's plan does not count those clips).
       or (p_redo_preview and p_provider <> 'mock' and coalesce(clip.meta->>'provider', '') = 'mock')
     );

  perform public.set_video_production(p_item_id, jsonb_build_object(
    'status', 'running',
    'aspect', p_aspect,
    'provider', p_provider,
    'with_voice', p_with_voice,
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

  if p_with_voice and not public.video_narration_ready(p_item_id) then
    -- lipsync: talking scenes get their voice from queue_video_lipsync, only when needed.
    select coalesce(array_agg(scene.id order by scene.position), '{}'::uuid[])
      into v_voice_ids
      from public.marketing_video_scenes as scene
     where scene.item_id = p_item_id
       and public.video_narration_line(scene.meta, scene.voiceover_text) <> '';
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

grant execute on function public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean, boolean)
  to authenticated, service_role;

-- ── 2. video_narration_ready ────────────────────────────────────────────────
-- Same body as 20261026102300_video_lipsync.sql; only the non-talking voice check changes.
create or replace function public.video_narration_ready(p_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(v.script, '') = ''
    or (
      not v.talking
      and exists (
        select 1 from public.marketing_assets
         where item_id = p_item_id
           and type = 'narration'
           and coalesce(url, '') <> ''
           and coalesce(meta->>'text', '') = v.script
      )
    )
    or not exists (
      select 1
        from public.marketing_video_scenes as scene
        cross join lateral (
          select public.video_narration_line(scene.meta, scene.voiceover_text) as line
        ) as l
        left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
       where scene.item_id = p_item_id
         and l.line <> ''
         and case
           when v.talking then not (
             coalesce(voice.type, '') = 'voiceover'
             and coalesce(voice.meta->>'text', '') = l.line
           )
           -- A continuous take counts only while it reads the whole script in order (the render
           -- plays it as one track); a reordered film is narrated again.
           when coalesce(voice.type, '') = 'narration' then
             coalesce(voice.meta->>'text', '') <> v.script
           else coalesce(voice.meta->>'text', '') <> l.line
         end
    )
  from (
    select string_agg(l.line, ' ' order by scene.position) filter (where l.line <> '') as script,
           coalesce(bool_or(coalesce(scene.meta->>'lipsync', '') = 'true'), false) as talking
      from public.marketing_video_scenes as scene
      cross join lateral (
        select public.video_narration_line(scene.meta, scene.voiceover_text) as line
      ) as l
     where scene.item_id = p_item_id
  ) as v;
$$;
