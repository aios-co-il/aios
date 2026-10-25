-- Video Studio: talking scenes with lip sync. Additive and safe to re-run.
--
-- A scene with meta.lipsync = true is a character speaking on screen. Its line is
-- meta.dialogue (Hebrew), else its voiceover_text; meta.speaker describes who speaks.
--
-- Two ways a talking scene gets its speech, both decided by what the clip already holds:
--   1. One pass: on an engine that speaks (ElevenLabs Veo 3.1, Higgsfield Seedance 2.5) the
--      clip job puts the line in the prompt and marks the clip meta.lipsync = true.
--   2. Lip-sync pass: otherwise advance_video_production queues the scene's own voice line
--      (a per-scene voice run), then one 'lipsync' run that makes the character mouth it.
--
-- A talking scene is left out of the narration so the film never plays both voices. When a
-- storyboard has a talking scene, the narration is spoken scene by scene (one voice run per
-- scene, played inside its scene) instead of one take across the film, which would talk over
-- the character.
--
-- Replaces (copied from their latest definitions, with the additions marked "lipsync"):
--   video_narration_ready, queue_video_sound   (20261025100200_video_narration_whitespace.sql)
--   advance_video_production, produce_video     (20261023140000_video_continuous_narration.sql)
--   claim_video_run                             (20261016160000_video_studio_review_fixes_2.sql)
--   save_video_storyboard                       (20261016140200_video_studio_run_claim.sql)

-- ── Run kind and one active lip-sync per scene ───────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'marketing_runs_kind_check'
       and conrelid = 'public.marketing_runs'::regclass
       and pg_get_constraintdef(oid) not like '%lipsync%'
  ) then
    alter table public.marketing_runs drop constraint marketing_runs_kind_check;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'marketing_runs_kind_check'
       and conrelid = 'public.marketing_runs'::regclass
  ) then
    alter table public.marketing_runs add constraint marketing_runs_kind_check
      check (kind is null or kind in ('still', 'clip', 'voice', 'music', 'render', 'reference_analysis', 'lipsync'));
  end if;
end $$;

-- Mirrors marketing_runs_one_active_scene_job (clip, voice): a double call never pays twice.
create unique index if not exists marketing_runs_one_active_lipsync
  on public.marketing_runs (scene_id)
  where scene_id is not null and status in ('queued', 'running') and kind = 'lipsync';

-- ── Lines ────────────────────────────────────────────────────────────────────
-- Kept in step with talkingLine / narrationLine in render-worker/src/narration.mjs.
create or replace function public.video_talking_line(p_meta jsonb, p_voiceover text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_meta->>'lipsync', '') = 'true' then
      coalesce(
        nullif(btrim(coalesce(p_meta->>'dialogue', ''), E' \t\r\n'), ''),
        btrim(coalesce(p_voiceover, ''), E' \t\r\n')
      )
    else ''
  end;
$$;

create or replace function public.video_narration_line(p_meta jsonb, p_voiceover text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_meta->>'lipsync', '') = 'true' then ''
    else btrim(coalesce(p_voiceover, ''), E' \t\r\n')
  end;
$$;

grant execute on function public.video_talking_line(jsonb, text) to authenticated, service_role;
grant execute on function public.video_narration_line(jsonb, text) to authenticated, service_role;

-- ── Narration readiness (talking scenes excluded) ────────────────────────────
-- True when there is nothing to narrate, the current script already has one narration
-- (only without talking scenes), or every narrated scene has a voice of its own line.
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
           else coalesce(voice.meta->'lines'->> (scene.id::text), voice.meta->>'text', '') <> l.line
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

grant execute on function public.video_narration_ready(uuid) to authenticated, service_role;

-- ── Sound queue: narration without talking scenes; scene by scene when there are any ──
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

-- ── Lip-sync queue ───────────────────────────────────────────────────────────
-- For each requested talking scene whose clip does not speak its line yet:
--   * no voice of exactly this line -> queue the scene's own voice run (ElevenLabs);
--   * a voice of this line          -> queue one 'lipsync' run.
-- A voice or lip sync that already failed for the same line (voice) or the same voice and
-- clip (lipsync) is not queued again, so a production never loops paying for it; p_retry
-- re-queues those after the cause was fixed. Security invoker: RLS limits the scenes and
-- runs to the caller's tenant, as in queue_video_clips and queue_video_sound.
create or replace function public.queue_video_lipsync(
  p_item_id uuid,
  p_scene_ids uuid[],
  p_estimate jsonb default '{}'::jsonb,
  p_stage_id uuid default null,
  p_retry boolean default false
)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_stage uuid;
  v_voice_id text;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'queue_video_lipsync: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  v_stage := coalesce(p_stage_id, v_item.current_stage_id);
  if v_stage is null then
    raise exception 'queue_video_lipsync: work item % has no stage', p_item_id using errcode = '22023';
  end if;
  v_voice_id := nullif(btrim(coalesce(v_item.payload->'video'->>'voice_id', '')), '');

  return query
  with talk as (
    select scene.id,
           scene.tenant_id,
           scene.still_asset_id,
           scene.clip_asset_id,
           scene.voice_asset_id,
           scene.duration_s,
           l.line,
           (coalesce(voice.type, '') = 'voiceover'
             and coalesce(voice.meta->>'text', '') = l.line) as voiced
      from public.marketing_video_scenes as scene
      cross join lateral (
        select public.video_talking_line(scene.meta, scene.voiceover_text) as line
      ) as l
      left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
      left join public.marketing_assets as clip on clip.id = scene.clip_asset_id
     where scene.item_id = p_item_id
       and scene.id = any(p_scene_ids)
       and l.line <> ''
       and scene.still_asset_id is not null
       and not (
         coalesce(clip.meta->>'lipsync', '') = 'true'
         and coalesce(clip.meta->>'dialogue', '') = l.line
       )
  ),
  voices as (
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
    select
      talk.tenant_id,
      p_item_id,
      v_stage,
      'voice',
      talk.id,
      'queued',
      'elevenlabs',
      jsonb_build_object(
        'scene_id', talk.id,
        'client_id', v_item.client_id,
        'voiceover_text', talk.line,
        'lipsync', true,
        'voice_id', v_voice_id,
        'estimate', '{}'::jsonb
      )
    from talk
    where not talk.voiced
      and (p_retry or not exists (
        select 1 from public.marketing_runs as done
         where done.scene_id = talk.id
           and done.kind = 'voice'
           and done.status = 'failed'
           and done.input->>'voiceover_text' = talk.line
      ))
    on conflict (scene_id, kind)
      where scene_id is not null and status in ('queued', 'running') and kind in ('clip', 'voice')
    do nothing
    returning *
  ),
  lips as (
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, input)
    select
      talk.tenant_id,
      p_item_id,
      v_stage,
      'lipsync',
      talk.id,
      'queued',
      jsonb_build_object(
        'scene_id', talk.id,
        'client_id', v_item.client_id,
        'dialogue', talk.line,
        'voice_asset_id', talk.voice_asset_id,
        'still_asset_id', talk.still_asset_id,
        'clip_asset_id', talk.clip_asset_id,
        'duration_s', talk.duration_s,
        'aspect', coalesce(v_item.payload->'video'->'production'->>'aspect', '9:16'),
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    from talk
    where talk.voiced
      and (p_retry or not exists (
        select 1 from public.marketing_runs as done
         where done.scene_id = talk.id
           and done.kind = 'lipsync'
           and done.status = 'failed'
           and done.input->>'voice_asset_id' = talk.voice_asset_id::text
           and done.input->>'clip_asset_id' is not distinct from talk.clip_asset_id::text
      ))
    on conflict (scene_id)
      where scene_id is not null and status in ('queued', 'running') and kind = 'lipsync'
    do nothing
    returning *
  )
  select * from voices
  union all
  select * from lips;
end;
$$;

grant execute on function public.queue_video_lipsync(uuid, uuid[], jsonb, uuid, boolean) to authenticated, service_role;

-- ── Production: lip-sync talking scenes after their voice, before the assembly ──
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
    select count(*) into v_queued
      from public.queue_video_lipsync(
        p_item_id, v_talk_ids, coalesce(v_prod->'estimate'->'lipsync', '{}'::jsonb), null, false
      );
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
   where scene.item_id = p_item_id
     and scene.still_asset_id is not null
     and (scene.clip_asset_id is null or scene.clip_stale or scene.status = 'failed');

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

-- ── Claim: an abandoned lip-sync run also moves its production on ────────────
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

-- ── Storyboard save keeps lipsync, speaker and dialogue in meta ──────────────
create or replace function public.save_video_storyboard(p_item_id uuid, p_scenes jsonb)
returns setof public.marketing_video_scenes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.marketing_work_items where id = p_item_id;
  if v_tenant is null then
    raise exception 'save_video_storyboard: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_scenes) is distinct from 'array' then
    raise exception 'save_video_storyboard: p_scenes must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_scenes) as scene
     where coalesce(scene->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'save_video_storyboard: every scene needs a uuid id' using errcode = '22023';
  end if;

  insert into public.marketing_video_scenes as existing (
    id, tenant_id, item_id, position, title, shot, visual_prompt, overlay_text, voiceover_text, motion_prompt, duration_s, locked, meta
  )
  select
    (scene->>'id')::uuid,
    v_tenant,
    p_item_id,
    coalesce((scene->>'position')::numeric, ord),
    coalesce(scene->>'title', ''),
    coalesce(nullif(scene->>'shot', ''), 'Medium shot'),
    coalesce(scene->>'visual_prompt', ''),
    coalesce(scene->>'overlay_text', ''),
    coalesce(scene->>'voiceover_text', ''),
    coalesce(scene->>'motion_prompt', ''),
    least(greatest(coalesce((scene->>'duration_s')::numeric, 3), 0.5), 120),
    coalesce((scene->>'locked')::boolean, false),
    jsonb_strip_nulls(jsonb_build_object(
      'canvas', case when jsonb_typeof(scene->'canvas') = 'object' then scene->'canvas' end,
      'has_character', case when jsonb_typeof(scene->'has_character') = 'boolean' then scene->'has_character' end,
      -- lipsync: a talking scene, who speaks, and the line the character says.
      'lipsync', case when jsonb_typeof(scene->'lipsync') = 'boolean' then scene->'lipsync' end,
      'speaker', case when jsonb_typeof(scene->'speaker') = 'string' then to_jsonb(left(btrim(scene->>'speaker'), 300)) end,
      'dialogue', case when jsonb_typeof(scene->'dialogue') = 'string' then to_jsonb(left(btrim(scene->>'dialogue'), 1000)) end
    ))
  from jsonb_array_elements(p_scenes) with ordinality as input(scene, ord)
  on conflict (id) do update set
    position = excluded.position,
    title = excluded.title,
    shot = excluded.shot,
    visual_prompt = excluded.visual_prompt,
    overlay_text = excluded.overlay_text,
    voiceover_text = excluded.voiceover_text,
    motion_prompt = excluded.motion_prompt,
    duration_s = excluded.duration_s,
    locked = excluded.locked,
    meta = existing.meta || excluded.meta
  where existing.item_id = p_item_id;

  return query
    select * from public.marketing_video_scenes where item_id = p_item_id order by position;
end;
$$;

grant execute on function public.save_video_storyboard(uuid, jsonb) to authenticated, service_role;
