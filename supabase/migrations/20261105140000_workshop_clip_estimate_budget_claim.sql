-- A film never spends past the budget the user approved (Staging, 5 Nov). Safe to re-run.
--
-- 1. Each clip run carries its own share of the quote. Callers pass queue_video_clips the
--    estimate of all the clips they queue (workshop_produce_video and the Video Studio both
--    price the whole set), and every run stored all of it: six OpenRouter clips quoted $2.52
--    together showed $2.52 each, $15.12 across the film, while each really cost $0.42. A run's
--    estimate.usd and estimate.credits are now the estimate divided by the scenes asked for.
--
-- 2. The claim reserves what a paid job may cost before handing it out. claim_video_run stopped
--    a paid job only once the recorded spend had reached the budget, so the jobs already running
--    could together pass it. A paid job no provider has taken yet is now refused when the
--    project's pictures, what its finished runs cost and what its jobs in flight are quoted at
--    (each run's estimate, or its cost when larger), with this job's own quote, would pass the
--    approved budget. Claims take one transaction lock, so two workers never both count the
--    same room. Unchanged: free preview clips, a job a provider already took, the render, and
--    projects without an approved workshop budget.
--
-- Replaces (copied from their latest definitions, changes marked "share" and "reserve"):
--   queue_video_clips  (20261025120000_video_studio_openrouter_engine.sql)
--   claim_video_run    (20261026103258_workshop_production_locks.sql)
-- Same arguments and grants. workshop_budget_used_up(item) becomes
-- workshop_budget_short(run), service role only.

-- ── 1. Clips: each run stores its own share of the quote ─────────────────────
-- Queues one image-to-video run per scene that has a still and no clip in flight; each run's
-- estimate is its share of p_estimate (the quote for all the scenes asked for).
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
  v_estimate jsonb := coalesce(p_estimate, '{}'::jsonb);
  v_scenes integer;
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

  -- share: the estimate covers every scene asked for, so each run stores its part of it.
  select count(distinct scene_id) into v_scenes from unnest(p_scene_ids) as scene_id;
  if v_scenes > 1 and jsonb_typeof(v_estimate) = 'object' then
    if jsonb_typeof(v_estimate->'usd') = 'number' then
      v_estimate := v_estimate || jsonb_build_object(
        'usd', round((v_estimate->>'usd')::numeric / v_scenes, 4));
    end if;
    if jsonb_typeof(v_estimate->'credits') = 'number' then
      v_estimate := v_estimate || jsonb_build_object(
        'credits', round((v_estimate->>'credits')::numeric / v_scenes, 2));
    end if;
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
        'estimate', v_estimate
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

-- ── 2. Claim: a paid job is handed out only while its quote fits the budget ──
-- Whether handing out this run could take its project past the budget the user approved: the
-- recorded spend has reached it, or the pictures, the runs' costs, the quotes of the jobs in
-- flight and this run's own quote together pass it. Never raises: a value that is not a number
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
      -- reserve: a job in flight (running, taken by a provider, or this one) counts at its
      -- quote until it reports a larger cost.
      coalesce(sum(
        case
          when run.status in ('queued', 'running')
           and (run.id = p_run_id or run.status = 'running' or run.provider_job_id is not null)
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
-- jobs the approved budget cannot cover, then claims one.
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

  -- reserve: one claim at a time, so a job claimed by another worker is in flight when this
  -- claim counts the budget's room (each statement below reads after the lock).
  perform pg_advisory_xact_lock(hashtext('public.claim_video_run'));

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
