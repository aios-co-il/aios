-- Workshop film fixes. Safe to re-run.
-- 1. produce_video with a paid engine animates again the scenes whose clip is a free mock preview.
-- 2. A production that fails closes the item's pending film pages, also when no render ran.

-- ── 1. produce_video: a mock clip is redone by a paid engine ─────────────────
-- Same body as 20261025150000_video_lipsync.sql; only the scene pick changes.
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
       -- A free-preview (mock) clip is animated again when a paid engine is chosen.
       or (p_provider <> 'mock' and coalesce(clip.meta->>'provider', '') = 'mock')
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

grant execute on function public.produce_video(uuid, text, text, jsonb, uuid, boolean, boolean, text, text, boolean)
  to authenticated, service_role;

-- ── 2. A failed production closes its pending film pages ─────────────────────
-- workshop_fail_pending_film only reacts to a failed render run; a production can also fail
-- before any render (narration missing, no clips to assemble). Never blocks the item update.
create or replace function public.workshop_fail_pending_films_on_production()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workshop_artifacts
     set status = 'failed',
         meta = meta || jsonb_build_object(
           'error',
           coalesce(nullif(new.payload->'video'->'production'->>'error', ''), 'ההפקה נכשלה')
         )
   where item_id = new.id
     and tenant_id = new.tenant_id
     and kind = 'film'
     and status = 'pending';
  return new;
exception when others then
  raise warning 'workshop_fail_pending_films_on_production: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists workshop_fail_pending_films_on_production on public.marketing_work_items;
create trigger workshop_fail_pending_films_on_production
  after update of payload on public.marketing_work_items
  for each row
  when (
    new.payload->'video'->'production'->>'status' = 'failed'
    and (old.payload->'video'->'production'->>'status') is distinct from 'failed'
  )
  execute function public.workshop_fail_pending_films_on_production();
