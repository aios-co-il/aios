-- A film never spends past the budget the user approved (Staging, 5 Nov). Safe to re-run.
--
-- 1. Each paid run carries its own share of the quote. Callers pass one estimate for all the
--    scenes they queue (workshop_produce_video and the Video Studio price the whole set), and
--    every run stored all of it: six OpenRouter clips quoted $2.52 together showed $2.52 each,
--    $15.12 across the film, while each really cost $0.42. Clips, a talking film's per-scene
--    voices and lip syncs now store the scene's share, weighted by its length (duration_s over
--    the seconds of the scenes the estimate covers; equal shares when there are none). Credits
--    take the same share, rounded to 0.01 (they are informational; the budget counts usd).
--    Every estimate a run stores is marked per_run: true, meaning "this run's own quote".
--
-- 2. The claim reserves what a paid job may cost before handing it out. claim_video_run stopped
--    a paid job only once the recorded spend had reached the budget, so the jobs already running
--    could together pass it. A paid job no provider has taken yet is now refused when the
--    project's pictures, what its finished runs cost and what its jobs in flight are quoted at
--    (each run's estimate, or its cost when larger), with this job's own quote, would pass the
--    approved budget. Only per_run estimates are reserved: a run queued before this migration
--    still carries the whole film's estimate, which would count N times, so it counts at its
--    recorded cost only, as before (those runs drain within the deploy's first production).
--    One claim runs at a time (a transaction advisory lock); a claim that finds the lock taken
--    returns no run and the worker polls again, so two workers never both count the same room.
--    Unchanged: free preview clips, a job a provider already took, the render, and projects
--    without an approved workshop budget.
--
-- Replaces (copied from their latest definitions, changes marked "share", "reserve" and "lock"):
--   queue_video_clips    (20261025120000_video_studio_openrouter_engine.sql)
--   queue_video_sound    (20261104110000_video_db_functions_consolidate.sql)
--   queue_video_lipsync  (20261026102300_video_lipsync.sql)
--   claim_video_run      (20261026103258_workshop_production_locks.sql)
-- Same arguments and grants. workshop_budget_used_up(item) becomes
-- workshop_budget_short(run), service role only.

-- ── 0. Shares ───────────────────────────────────────────────────────────────
-- A scene's share of an estimate covering several: its seconds over theirs, or an equal share
-- when the seconds are unknown.
create or replace function public.video_scene_share(p_seconds numeric, p_total_seconds numeric, p_scenes bigint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_seconds, 0) > 0 and coalesce(p_total_seconds, 0) > 0
      then least(1, p_seconds / p_total_seconds)
    when coalesce(p_scenes, 0) > 0 then 1.0 / p_scenes
    else 1
  end;
$$;

-- The estimate one run stores: p_share of usd and credits, marked per_run (its own quote, which
-- workshop_budget_short reserves). Anything that is not an object stores as an empty estimate.
create or replace function public.video_run_estimate(p_estimate jsonb, p_share numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select e
    || jsonb_build_object('per_run', true)
    || case when jsonb_typeof(e->'usd') = 'number'
         then jsonb_build_object('usd', round((e->>'usd')::numeric * p_share, 4))
         else '{}'::jsonb end
    || case when jsonb_typeof(e->'credits') = 'number'
         then jsonb_build_object('credits', round((e->>'credits')::numeric * p_share, 2))
         else '{}'::jsonb end
    from (
      select case when jsonb_typeof(p_estimate) = 'object' then p_estimate else '{}'::jsonb end as e
    ) as given;
$$;

revoke all on function public.video_scene_share(numeric, numeric, bigint) from public, anon;
revoke all on function public.video_run_estimate(jsonb, numeric) from public, anon;
grant execute on function public.video_scene_share(numeric, numeric, bigint) to authenticated, service_role;
grant execute on function public.video_run_estimate(jsonb, numeric) to authenticated, service_role;

-- ── 1. Clips: each run stores its own share of the quote ─────────────────────
-- Queues one image-to-video run per scene that has a still and no clip in flight; each run's
-- estimate is its scene's share of p_estimate (the quote for all the scenes asked for).
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
  v_seconds numeric;
  v_scenes bigint;
begin
  if p_provider not in ('mock', 'kling', 'elevenlabs', 'higgsfield', 'openrouter') then
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

  -- share: the estimate covers every scene asked for, so each run stores its scene's part.
  select coalesce(sum(scene.duration_s), 0), count(*)
    into v_seconds, v_scenes
    from public.marketing_video_scenes as scene
   where scene.item_id = p_item_id
     and scene.id = any(p_scene_ids);

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
        'estimate', public.video_run_estimate(
          p_estimate, public.video_scene_share(picked.duration_s, v_seconds, v_scenes))
      )
    from picked
    on conflict (scene_id, kind)
      where scene_id is not null and status in ('queued', 'running') and kind in ('clip', 'voice')
      do nothing
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

-- ── 1b. Talking film: each scene's voice stores its share ────────────────────
-- Queues the music bed, or the narration: one continuous take, or with a talking scene one
-- voice per narrated scene whose take is not current, each with its scene's share of the quote.
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
        'estimate', public.video_run_estimate(p_estimate, 1)
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
    -- share: the voice estimate covers every narrated scene asked for, so each run stores its
    -- scene's part, as queue_video_clips does.
    select coalesce(sum(scene.duration_s), 0) into v_seconds
      from public.marketing_video_scenes as scene
     where scene.id = any(v_ids);
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
        'estimate', public.video_run_estimate(
          p_estimate, public.video_scene_share(scene.duration_s, v_seconds, cardinality(v_ids)))
      )
    from public.video_narrated_scenes(p_item_id) as n
    join public.marketing_video_scenes as scene on scene.id = n.scene_id
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
        'estimate', public.video_run_estimate(p_estimate, 1)
      )
    )
    returning *;
  exception when unique_violation then
    return;
  end;
end;
$$;

revoke all on function public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text) from public, anon;
grant execute on function public.queue_video_sound(uuid, text, uuid[], text, jsonb, uuid, text, text) to authenticated, service_role;

-- ── 1c. Lip sync: each scene's pass stores its share ─────────────────────────
-- For each requested talking scene whose clip does not speak its line yet:
--   * no voice of exactly this line -> queue the scene's own voice run (ElevenLabs);
--   * a voice of this line          -> queue one 'lipsync' run, with its scene's share of the quote.
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
  v_started timestamptz;
  v_seconds numeric;
  v_scenes bigint;
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

  -- share: the estimate covers the talking scenes this production lip-syncs: those asked for
  -- whose clip does not speak its line yet, and those already lip-synced since the production
  -- started (a lip sync that finished leaves the list the caller passes next time, and the
  -- scenes still to come must not take its part as well).
  v_started := case when jsonb_typeof(v_item.payload->'video'->'production'->'started_at') = 'string'
    then (v_item.payload->'video'->'production'->>'started_at')::timestamptz end;
  select coalesce(sum(scene.duration_s), 0), count(*)
    into v_seconds, v_scenes
    from public.marketing_video_scenes as scene
    cross join lateral (
      select public.video_talking_line(scene.meta, scene.voiceover_text) as line
    ) as l
    left join public.marketing_assets as clip on clip.id = scene.clip_asset_id
   where scene.item_id = p_item_id
     and l.line <> ''
     and scene.still_asset_id is not null
     and (
       (scene.id = any(p_scene_ids)
        and not (
          coalesce(clip.meta->>'lipsync', '') = 'true'
          and coalesce(clip.meta->>'dialogue', '') = l.line
        ))
       or exists (
         select 1 from public.marketing_runs as synced
          where synced.scene_id = scene.id
            and synced.kind = 'lipsync'
            and synced.status = 'completed'
            and synced.created_at >= v_started
       )
     );

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
        'estimate', public.video_run_estimate(
          p_estimate, public.video_scene_share(talk.duration_s, v_seconds, v_scenes))
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

revoke all on function public.queue_video_lipsync(uuid, uuid[], jsonb, uuid, boolean) from public, anon;
grant execute on function public.queue_video_lipsync(uuid, uuid[], jsonb, uuid, boolean) to authenticated, service_role;

-- ── 2. Claim: a paid job is handed out only while its quote fits the budget ──
-- Whether handing out this run could take its project past the budget the user approved: the
-- recorded spend has reached it, or the pictures, the runs' costs, the per_run quotes of the jobs
-- in flight and this run's own quote together pass it. Never raises: a value that is not a number
-- counts as none, so one odd payload cannot stop the claim.
create or replace function public.workshop_budget_short(p_run_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select run.item_id from public.marketing_runs as run where run.id = p_run_id
  ),
  amounts as (
    select
      case when jsonb_typeof(b->'cap_usd') = 'number' then (b->>'cap_usd')::numeric else 0 end as cap,
      case when jsonb_typeof(b->'quoted_usd'->'workshop_make_creative') = 'number'
        then (b->'quoted_usd'->>'workshop_make_creative')::numeric else 0 end
      + case when jsonb_typeof(b->'quoted_usd'->'workshop_make_stills') = 'number'
        then (b->'quoted_usd'->>'workshop_make_stills')::numeric else 0 end as pictures,
      item.id as item_id
      from target
      join public.marketing_work_items as item on item.id = target.item_id
      cross join lateral (select item.payload->'workshop_budget' as b) as budget
  ),
  runs as (
    select
      coalesce(sum(run.cost_usd), 0) as spent,
      -- reserve: a job in flight (running, taken by a provider, or this one) counts at its own
      -- quote until it reports a larger cost. A run queued before 20261105140000 holds the whole
      -- film's estimate (no per_run), so it counts at its cost only.
      coalesce(sum(
        case
          when run.status in ('queued', 'running')
           and (run.id = p_run_id or run.status = 'running' or run.provider_job_id is not null)
           and run.input->'estimate'->'per_run' = 'true'::jsonb
           and jsonb_typeof(run.input->'estimate'->'usd') = 'number'
            then greatest(run.cost_usd, (run.input->'estimate'->>'usd')::numeric)
          else run.cost_usd
        end
      ), 0) as projected
      from amounts
      join public.marketing_runs as run on run.item_id = amounts.item_id
     where run.kind in ('clip', 'voice', 'music', 'lipsync', 'render')
  )
  select coalesce((
    select amounts.cap > 0
       and (amounts.pictures + runs.spent >= amounts.cap
            or amounts.pictures + runs.projected > amounts.cap + 0.005)
      from amounts, runs
  ), false);
$$;

revoke all on function public.workshop_budget_short(uuid) from public, anon, authenticated;
grant execute on function public.workshop_budget_short(uuid) to service_role;

-- Hands the oldest due run of these kinds to a worker: first fails runs out of attempts and paid
-- jobs the approved budget cannot cover, then claims one. No run while another claim is running.
create or replace function public.claim_video_run(p_kinds text[], p_worker text default null)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_abandoned record;
  v_over record;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'claim_video_run: service role only' using errcode = '42501';
  end if;

  -- lock: one claim at a time, so a job claimed by another worker is in flight when this
  -- claim counts the budget's room (each statement below reads after the lock). A claim that
  -- finds it taken hands out nothing; the worker polls again.
  if not pg_try_advisory_xact_lock(hashtextextended('claim_video_run', 0)) then
    raise notice 'claim_video_run: another claim holds the lock; nothing handed out';
    return;
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

  -- budget: a paid job no provider has taken yet is not handed out when its quote does not fit
  -- in what is left of the project's approved budget. It fails as a scene that could not be
  -- made does.
  for v_over in
    update public.marketing_runs as waiting
       set status = 'failed',
           finished_at = now(),
           error = 'התקציב שאושר לפרויקט לא מכסה את השלב הזה: ההוצאה בפועל והשלבים שכבר רצים לא משאירים לו מקום, ולכן הוא לא הופעל. כדי להמשיך צריך להגדיל את התקציב.'
     where waiting.kind = any(p_kinds)
       and waiting.kind in ('clip', 'voice', 'music', 'lipsync')
       and not (waiting.kind = 'clip' and coalesce(waiting.provider, '') = 'mock')
       and waiting.provider_job_id is null
       and (
         waiting.status = 'queued'
         or (waiting.status = 'running'
             and waiting.started_at < now() - interval '45 minutes'
             and waiting.attempts < 3)
       )
       and public.workshop_budget_short(waiting.id)
    returning waiting.item_id, waiting.scene_id, waiting.kind
  loop
    if v_over.kind = 'clip' and v_over.scene_id is not null then
      update public.marketing_video_scenes
         set status = 'failed'
       where id = v_over.scene_id
         and status = 'clip_generating';
    end if;
    begin
      perform public.advance_video_production(v_over.item_id);
    exception when others then
      raise warning 'claim_video_run: advance_video_production(%): %', v_over.item_id, sqlerrm;
    end;
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

revoke all on function public.claim_video_run(text[], text) from public, anon, authenticated;
grant execute on function public.claim_video_run(text[], text) to service_role;

drop function if exists public.workshop_budget_used_up(uuid);
