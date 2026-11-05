-- Carmen workshop plan 11.5: the video and workshop functions that each later migration copied
-- whole now share small helpers, so the next change edits one of them instead of a full body.
-- Safe to re-run.
--
-- 1. Shared helpers: the project's voice, whether a voice take is current, the scenes the
--    narration reads, whether the film talks (lip sync), and the workshop's pending page.
-- 2. queue_video_sound, video_narration_ready and workshop_mirror_asset use them, with the same
--    behaviour as their latest definitions (20261026102900, 20261026102800, 20261026101800).
-- 3. produce_video takes one jsonb of options. The old eleven-argument signature stays as a thin
--    wrapper for one deploy window: the Vercel frontend, the edge functions and this migration
--    deploy separately, and a browser tab opened before the deploy still sends the old
--    arguments. Drop it in a later migration once every caller sends p_options.
-- 4. workshop_creative_stage checks that the caller works in the tenant it names.

-- ── 1. Shared helpers ───────────────────────────────────────────────────────

-- The voice the project narrates with (payload.video.voice_id), or null when none is chosen.
create or replace function public.video_project_voice(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p_payload->'video'->>'voice_id', '')), '');
$$;

-- Whether a voice take reads this line in the project's voice (video_voice_matches).
create or replace function public.video_take_current(p_meta jsonb, p_line text, p_voice text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_meta->>'text', '') = p_line
     and public.video_voice_matches(p_meta, p_voice);
$$;

-- The scenes the narration reads: a non-empty narration line (video_narration_line leaves out
-- talking scenes). Runs as the caller, so the caller's RLS decides which scenes exist.
create or replace function public.video_narrated_scenes(p_item_id uuid)
returns table (scene_id uuid, tenant_id uuid, scene_position numeric, line text, voice_asset_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select scene.id, scene.tenant_id, scene.position, l.line, scene.voice_asset_id
    from public.marketing_video_scenes as scene
    cross join lateral (
      select public.video_narration_line(scene.meta, scene.voiceover_text) as line
    ) as l
   where scene.item_id = p_item_id
     and l.line <> '';
$$;

-- Whether the film has a talking (lip sync) scene: each narrated scene then gets its own voice.
create or replace function public.video_film_talks(p_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.marketing_video_scenes as scene
     where scene.item_id = p_item_id and coalesce(scene.meta->>'lipsync', '') = 'true'
  );
$$;

revoke all on function public.video_project_voice(jsonb) from public, anon;
revoke all on function public.video_take_current(jsonb, text, text) from public, anon;
revoke all on function public.video_narrated_scenes(uuid) from public, anon;
revoke all on function public.video_film_talks(uuid) from public, anon;
grant execute on function public.video_project_voice(jsonb) to authenticated, service_role;
grant execute on function public.video_take_current(jsonb, text, text) to authenticated, service_role;
grant execute on function public.video_narrated_scenes(uuid) to authenticated, service_role;
grant execute on function public.video_film_talks(uuid) to authenticated, service_role;

-- The newest pending page of one kind in a project of one tenant, for one scene when given.
-- Internal to workshop_mirror_asset (security definer, owned by postgres): no API role calls it.
create or replace function public.workshop_pending_artifact(
  p_tenant_id uuid,
  p_item_id uuid,
  p_kind text,
  p_scene_id text default null
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select artifact.id
    from public.workshop_artifacts as artifact
   where artifact.item_id = p_item_id
     and artifact.tenant_id = p_tenant_id
     and artifact.kind = p_kind
     and artifact.status = 'pending'
     and (p_scene_id is null or artifact.meta->>'scene_id' = p_scene_id)
   order by artifact.created_at desc
   limit 1;
$$;

-- Turns a pending page into the ready page of an asset: its address, thumbnail and reference,
-- with p_drop_meta removed from the page's meta and p_add_meta merged in.
create or replace function public.workshop_settle_pending_artifact(
  p_artifact_id uuid,
  p_asset_id uuid,
  p_url text,
  p_thumb_url text,
  p_drop_meta text[],
  p_add_meta jsonb
)
returns void
language sql
set search_path = ''
as $$
  update public.workshop_artifacts
     set status = 'ready',
         url = p_url,
         thumb_url = p_thumb_url,
         ref_table = 'marketing_assets',
         ref_id = p_asset_id,
         meta = (meta - p_drop_meta) || p_add_meta
   where id = p_artifact_id;
$$;

revoke all on function public.workshop_pending_artifact(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.workshop_settle_pending_artifact(uuid, uuid, text, text, text[], jsonb)
  from public, anon, authenticated, service_role;

-- ── 2a. queue_video_sound ───────────────────────────────────────────────────
-- Queues the music bed, or the narration: one continuous take, or with a talking scene one
-- voice per narrated scene whose take is not current.
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
  v_voice_id text := nullif(btrim(coalesce(p_voice_id, '')), '');
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

  select coalesce(array_agg(n.scene_id order by n.scene_position), '{}'::uuid[]),
         string_agg(n.line, ' ' order by n.scene_position)
    into v_ids, v_script
    from public.video_narrated_scenes(p_item_id) as n
   where n.scene_id = any(p_scene_ids);
  if coalesce(v_script, '') = '' then
    return;
  end if;

  -- With a talking scene each narrated scene gets its own voice, played inside that scene, so
  -- no narration runs over the character's line. A take in another voice is made again.
  if public.video_film_talks(p_item_id) then
    return query
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, scene_id, status, provider, input)
    select
      n.tenant_id,
      p_item_id,
      v_stage,
      'voice',
      n.scene_id,
      'queued',
      p_provider,
      jsonb_build_object(
        'scene_id', n.scene_id,
        'client_id', v_item.client_id,
        'voiceover_text', n.line,
        'voice_id', v_voice_id,
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    from public.video_narrated_scenes(p_item_id) as n
    left join public.marketing_assets as voice on voice.id = n.voice_asset_id
    where n.scene_id = any(v_ids)
      and not (
        coalesce(voice.type, '') = 'voiceover'
        and public.video_take_current(voice.meta, n.line, public.video_project_voice(v_item.payload))
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
        'voice_id', v_voice_id,
        'estimate', coalesce(p_estimate, '{}'::jsonb)
      )
    )
    returning *;
  exception when unique_violation then
    return;
  end;
end;
$$;

-- ── 2b. video_narration_ready ───────────────────────────────────────────────
-- Whether the film's narration is current: no script; or (no talking scene) the newest
-- continuous take reads the whole script in the project's voice; or every narrated scene has a
-- current take of its own (a voiceover when the film talks).
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
      and public.video_take_current(v.latest_meta, v.script, v.voice)
    )
    or not exists (
      select 1
        from public.video_narrated_scenes(p_item_id) as n
        left join public.marketing_assets as voice on voice.id = n.voice_asset_id
       where case
           when v.talking then not (
             coalesce(voice.type, '') = 'voiceover'
             and public.video_take_current(voice.meta, n.line, v.voice)
           )
           -- A continuous take counts only as the newest take of the whole script (above).
           when coalesce(voice.type, '') = 'narration' then true
           else not public.video_take_current(voice.meta, n.line, v.voice)
         end
    )
  from (
    select (
             select string_agg(n.line, ' ' order by n.scene_position)
               from public.video_narrated_scenes(p_item_id) as n
           ) as script,
           public.video_film_talks(p_item_id) as talking,
           (
             select newest.meta
               from public.marketing_assets as newest
              where newest.item_id = p_item_id
                and newest.type = 'narration'
                and newest.url is not null
              order by newest.created_at desc
              limit 1
           ) as latest_meta,
           (
             select public.video_project_voice(item.payload)
               from public.marketing_work_items as item
              where item.id = p_item_id
           ) as voice
  ) as v;
$$;

-- ── 2c. workshop_mirror_asset ───────────────────────────────────────────────
-- Mirrors a finished video asset onto the workshop board of its own tenant: fills the pending
-- page of its scene still or film, or adds a ready page.
create or replace function public.workshop_mirror_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_kind text;
  v_folder text;
  v_title text;
  v_scene record;
  v_pending uuid;
begin
  v_kind := case new.type
    when 'video_still' then 'scene_still'
    when 'video_clip' then 'clip'
    when 'narration' then 'narration'
    when 'music' then 'music'
    when 'render' then 'film'
    when 'reference_video' then 'reference'
    else null
  end;
  if v_kind is null or coalesce(new.url, '') = '' then
    return new;
  end if;

  select payload into v_payload
    from public.marketing_work_items
   where id = new.item_id and tenant_id = new.tenant_id;
  if v_payload is null or not (v_payload ? 'workshop') then
    return new;
  end if;

  if exists (
    select 1 from public.workshop_artifacts
     where ref_table = 'marketing_assets' and ref_id = new.id and tenant_id = new.tenant_id
  ) then
    return new;
  end if;

  v_folder := case v_kind
    when 'scene_still' then 'video/scenes'
    when 'clip' then 'video/scenes'
    when 'narration' then 'video/narration'
    when 'music' then 'video/music'
    when 'film' then 'video/film'
    else 'references'
  end;

  v_title := case v_kind
    when 'narration' then 'קריינות'
    when 'music' then 'מוזיקה'
    when 'film' then 'הסרט'
    when 'reference' then 'רפרנס'
    else ''
  end;

  if v_kind in ('scene_still', 'clip') and (new.meta ->> 'scene_id') is not null then
    select position, title into v_scene
      from public.marketing_video_scenes
     where id = (new.meta ->> 'scene_id')::uuid
       and item_id = new.item_id
       and tenant_id = new.tenant_id;
    if found then
      v_title := (case v_kind when 'clip' then 'הנפשה · סצנה ' else 'סצנה ' end)
        || trim(to_char(v_scene.position, 'FM999990.##'), '.')
        || case when coalesce(v_scene.title, '') <> '' then ' · ' || v_scene.title else '' end;
    end if;
  end if;
  if v_title = '' then
    v_title := case v_kind when 'clip' then 'הנפשה' else 'תמונת סצנה' end;
  end if;

  -- A scene still fills its scene's pending picture; a film fills the pending film page.
  if (v_kind = 'scene_still' and (new.meta ->> 'scene_id') is not null) or v_kind = 'film' then
    v_pending := public.workshop_pending_artifact(
      new.tenant_id, new.item_id, v_kind,
      case when v_kind = 'scene_still' then new.meta ->> 'scene_id' end
    );
    if v_pending is not null then
      if v_kind = 'scene_still' then
        perform public.workshop_settle_pending_artifact(
          v_pending, new.id, new.url, new.url, array['placeholder'],
          jsonb_build_object('asset_id', new.id, 'asset_type', new.type)
        );
      else
        perform public.workshop_settle_pending_artifact(
          v_pending, new.id, new.url, null, '{}'::text[], jsonb_build_object('asset_id', new.id)
        );
      end if;
      return new;
    end if;
  end if;

  insert into public.workshop_artifacts
    (tenant_id, item_id, kind, folder, title, status, url, thumb_url, ref_table, ref_id, meta)
  values (
    new.tenant_id,
    new.item_id,
    v_kind,
    v_folder,
    v_title,
    'ready',
    new.url,
    case when v_kind in ('scene_still', 'reference') then new.url else null end,
    'marketing_assets',
    new.id,
    jsonb_build_object('asset_id', new.id, 'asset_type', new.type)
      || jsonb_strip_nulls(jsonb_build_object(
           'provider', new.meta ->> 'provider',
           'fallback_from', new.meta ->> 'fallback_from'
         ))
  );
  return new;
exception when others then
  raise warning 'workshop_mirror_asset: %', sqlerrm;
  return new;
end;
$$;

-- ── 3. produce_video(p_item_id, p_options) ──────────────────────────────────
-- Starts (or resumes) a film's production: marks it running, queues the clips, narration and
-- music it still needs, and advances it. p_options keys, each optional: aspect ('9:16'),
-- provider ('mock'), estimate ({} with clips, voice, music, ...), stage_id, with_voice (true),
-- with_music (true), voice_id, music_prompt, generate_audio (false), redo_preview (false).
-- A key given as null means null, as the old named argument did. An unknown key is refused.
create or replace function public.produce_video(p_item_id uuid, p_options jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opts jsonb;
  v_unknown text;
  v_aspect text;
  v_provider text;
  v_estimate jsonb;
  v_stage_id uuid;
  v_with_voice boolean;
  v_with_music boolean;
  v_voice_id text;
  v_music_prompt text;
  v_generate_audio boolean;
  v_redo_preview boolean;
  v_item public.marketing_work_items;
  v_clip_ids uuid[];
  v_voice_ids uuid[];
  v_clips integer := 0;
  v_voices integer := 0;
  v_music integer := 0;
  v_state text;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'object' then
    raise exception 'produce_video: options must be an object' using errcode = '22023';
  end if;
  select k into v_unknown
    from jsonb_object_keys(p_options) as k
   where k not in (
     'aspect', 'provider', 'estimate', 'stage_id', 'with_voice', 'with_music', 'voice_id',
     'music_prompt', 'generate_audio', 'redo_preview'
   )
   limit 1;
  if v_unknown is not null then
    raise exception 'produce_video: unknown option %', v_unknown using errcode = '22023';
  end if;

  v_opts := jsonb_build_object(
    'aspect', '9:16', 'provider', 'mock', 'estimate', '{}'::jsonb, 'with_voice', true,
    'with_music', true, 'generate_audio', false, 'redo_preview', false
  ) || p_options;
  v_aspect := v_opts->>'aspect';
  v_provider := v_opts->>'provider';
  v_estimate := coalesce(nullif(v_opts->'estimate', 'null'::jsonb), '{}'::jsonb);
  v_stage_id := (v_opts->>'stage_id')::uuid;
  v_with_voice := (v_opts->>'with_voice')::boolean;
  v_with_music := (v_opts->>'with_music')::boolean;
  v_voice_id := v_opts->>'voice_id';
  v_music_prompt := v_opts->>'music_prompt';
  v_generate_audio := (v_opts->>'generate_audio')::boolean;
  v_redo_preview := (v_opts->>'redo_preview')::boolean;

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
       or (v_redo_preview and v_provider <> 'mock' and coalesce(clip.meta->>'provider', '') = 'mock')
     );

  perform public.set_video_production(p_item_id, jsonb_build_object(
    'status', 'running',
    'aspect', v_aspect,
    'provider', v_provider,
    'with_voice', v_with_voice,
    'started_at', now(),
    'finished_at', null,
    'render_run_id', null,
    'error', null,
    'estimate', v_estimate
  ));

  if cardinality(v_clip_ids) > 0 then
    select count(*) into v_clips
      from public.queue_video_clips(
        p_item_id, v_clip_ids, v_aspect, coalesce(v_estimate->'clips', '{}'::jsonb),
        v_stage_id, v_provider, v_generate_audio
      );
  end if;

  if v_with_voice and not public.video_narration_ready(p_item_id) then
    -- lipsync: talking scenes get their voice from queue_video_lipsync, only when needed.
    select coalesce(array_agg(n.scene_id order by n.scene_position), '{}'::uuid[])
      into v_voice_ids
      from public.video_narrated_scenes(p_item_id) as n;
    select count(*) into v_voices
      from public.queue_video_sound(
        p_item_id, 'voice', v_voice_ids, 'elevenlabs',
        coalesce(v_estimate->'voice', '{}'::jsonb), v_stage_id, null, v_voice_id
      );
  end if;

  if v_with_music and not exists (
    select 1 from public.marketing_assets
     where item_id = p_item_id and type = 'music' and coalesce(url, '') <> ''
  ) then
    select count(*) into v_music
      from public.queue_video_sound(
        p_item_id, 'music', '{}'::uuid[], 'elevenlabs',
        coalesce(v_estimate->'music', '{}'::jsonb), v_stage_id, v_music_prompt, null
      );
  end if;

  v_state := public.advance_video_production(p_item_id);
  return jsonb_build_object('status', v_state, 'clips', v_clips, 'voices', v_voices, 'music', v_music);
end;
$$;

revoke all on function public.produce_video(uuid, jsonb) from public, anon;
grant execute on function public.produce_video(uuid, jsonb) to authenticated, service_role;

-- The old signature, kept for one deploy window: passes every argument on as an option, so an
-- explicit null still means null. p_options has no default above, so produce_video(item) alone
-- still resolves here. Drop this wrapper (and give p_options its '{}' default) once no deployed
-- caller sends the old arguments (docs/carmen-workshop-plan.md, section 11, item 8). Until then a
-- plain SQL caller must cast the options: produce_video(id, '{...}'::jsonb), since an untyped
-- literal resolves to this wrapper as p_aspect.
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
language sql
security invoker
set search_path = ''
as $$
  select public.produce_video(p_item_id, jsonb_build_object(
    'aspect', p_aspect,
    'provider', p_provider,
    'estimate', p_estimate,
    'stage_id', p_stage_id,
    'with_voice', p_with_voice,
    'with_music', p_with_music,
    'voice_id', p_voice_id,
    'music_prompt', p_music_prompt,
    'generate_audio', p_generate_audio,
    'redo_preview', p_redo_preview
  ));
$$;

-- ── 4. workshop_creative_stage: the caller's own tenant ─────────────────────
-- The creative stage of a client's campaigns pipeline (or of the active "no client" pipeline
-- when p_client_id is null), created when missing. Only for the tenant the caller works in
-- (get_user_tenant_id: a member's active tenant, or the one a super admin acts in), the same
-- rule as the pipelines' read and write policies, or for the service role and the database
-- owner (edge functions, which pass a tenant they resolved for the caller). Before, a call for
-- another tenant failed only deep inside, on those policies.
create or replace function public.workshop_creative_stage(
  p_tenant_id uuid,
  p_client_id uuid default null
)
returns table (pipeline_id uuid, stage_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage uuid;
begin
  if coalesce(auth.jwt() ->> 'role', auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'service_role')
     and p_tenant_id is distinct from public.get_user_tenant_id(auth.uid()) then
    raise exception 'workshop_creative_stage: not the organization you work in'
      using errcode = '42501';
  end if;
  v_stage := public.workshop_department_stage(p_tenant_id, p_client_id, 'campaigns', 'creative');
  return query
    select s.pipeline_id, s.id from public.marketing_pipeline_stages s where s.id = v_stage;
end;
$$;
