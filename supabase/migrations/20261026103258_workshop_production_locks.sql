-- PR 932 review, round 2. Safe to re-run.
--
-- 1. R932-27 / R932-30: no new storyboard while the film is produced. workshop_storyboard and
--    workshop_edit_from_assets (replace=true) save through save_video_storyboard, which had no
--    production check, so they could replace the scenes a running production's paid runs
--    belong to. It now refuses as workshop_edit_scene_text does (20261026103257): errcode
--    55006 while produce_video's own lock holds (status running, started within the hour).
--
-- 2. R932-16 / R932-33: the addresses the workshop shows are only what the app writes. An
--    asset's url opens as a link and shows as a picture (AssetCard), and a board page's url and
--    thumb_url play as its picture, video or sound (WorkshopFeed), but members write both tables
--    through the API, so a javascript: or data: address could be stored. Assets: http(s) only
--    (uploads keep their public url, links and sites are http(s), storage_path holds the path).
--    Pages: http(s), or a path in the project's storage ("<tenant>/<item>/clip.mp4"; the board
--    signs it), whose first part has no ":" and so is never a scheme. Staging (read-only check,
--    2026-10-28) has neither table yet, so nothing violates them and they are validated here.
--
-- 3. R932-7 / R932-31: real spend stays within the approved budget (AIO-224). The quote only
--    estimates what a film costs, so claim_video_run now enforces the budget the user approved
--    (payload.workshop_budget.cap_usd). The real spend in the database at claim time is what the
--    project's pictures were charged (workshop_budget.quoted_usd for the picture tools; they are
--    never re-priced) plus what the render worker recorded on the project's runs (cost_usd of
--    clip, voice, music, lipsync and render, the kinds budget-settle.ts counts). Once that meets
--    or exceeds the budget, a paid job that no provider has taken yet (a clip on a paid engine,
--    a voice, a music bed or a lip sync, queued or due for a retry, no provider_job_id) is not
--    handed to a worker: it ends failed with the budget error, a clip's scene is failed, and
--    advance_video_production moves the production on as after any failed scene. Not stopped:
--    free preview clips, a job a provider already took (resuming it costs nothing new), the
--    render (it assembles what was made; render.mjs pays its sound effects only up to their
--    quote), and projects without an approved workshop budget.
--
-- Replaces (copied from their latest definitions, changes marked):
--   save_video_storyboard  (20261026103230_video_scene_reference.sql)        "production lock"
--   claim_video_run        (20261026103254_video_production_stage_guard.sql)  "budget"
-- Same arguments and grants. New: workshop_budget_used_up(item), service role only.

-- ── 1. Storyboard: nothing is replaced while the film is produced ──────────────
create or replace function public.save_video_storyboard(p_item_id uuid, p_scenes jsonb)
returns setof public.marketing_video_scenes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid;
  v_production jsonb;
begin
  select tenant_id, payload->'video'->'production' into v_tenant, v_production
    from public.marketing_work_items where id = p_item_id;
  if v_tenant is null then
    raise exception 'save_video_storyboard: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  -- production lock: the scenes a running production's runs belong to stay as they are.
  if coalesce(v_production->>'status', '') = 'running'
     and coalesce((v_production->>'started_at')::timestamptz, now()) > now() - interval '1 hour' then
    raise exception 'save_video_storyboard: the film is being produced'
      using errcode = '55006';
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
      'dialogue', case when jsonb_typeof(scene->'dialogue') = 'string' then to_jsonb(left(btrim(scene->>'dialogue'), 1000)) end,
      -- reference: the scene's own character picture, an https address only.
      'reference_url', case
        when jsonb_typeof(scene->'reference_url') = 'string'
         and btrim(scene->>'reference_url') ~* '^https://\S+$'
         and length(btrim(scene->>'reference_url')) <= 2000
        then to_jsonb(btrim(scene->>'reference_url'))
      end
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

revoke all on function public.save_video_storyboard(uuid, jsonb) from public, anon;
grant execute on function public.save_video_storyboard(uuid, jsonb) to authenticated, service_role;

-- ── 2. Addresses: only what the app writes ─────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workshop_assets_url_web' and conrelid = 'public.workshop_assets'::regclass
  ) then
    alter table public.workshop_assets
      add constraint workshop_assets_url_web
      check (url is null or url ~* '^https?://') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'workshop_artifacts_url_safe' and conrelid = 'public.workshop_artifacts'::regclass
  ) then
    alter table public.workshop_artifacts
      add constraint workshop_artifacts_url_safe
      check (
        url is null
        or url ~* '^https?://'
        or url ~ '^[[:alnum:]_][[:alnum:]_.-]*(/.*)?$'
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'workshop_artifacts_thumb_url_safe' and conrelid = 'public.workshop_artifacts'::regclass
  ) then
    alter table public.workshop_artifacts
      add constraint workshop_artifacts_thumb_url_safe
      check (
        thumb_url is null
        or thumb_url ~* '^https?://'
        or thumb_url ~ '^[[:alnum:]_][[:alnum:]_.-]*(/.*)?$'
      ) not valid;
  end if;
end $$;

alter table public.workshop_assets validate constraint workshop_assets_url_web;
alter table public.workshop_artifacts validate constraint workshop_artifacts_url_safe;
alter table public.workshop_artifacts validate constraint workshop_artifacts_thumb_url_safe;

-- ── 3. Claim: no paid job once the approved budget is spent ────────────────────
-- Whether the project's recorded spend has reached the budget the user approved. Never raises:
-- a value that is not a number counts as none, so one odd payload cannot stop the claim.
create or replace function public.workshop_budget_used_up(p_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with budget as (
    select item.payload->'workshop_budget' as b
      from public.marketing_work_items as item
     where item.id = p_item_id
  ),
  amounts as (
    select
      case when jsonb_typeof(b->'cap_usd') = 'number' then (b->>'cap_usd')::numeric else 0 end as cap,
      case when jsonb_typeof(b->'quoted_usd'->'workshop_make_creative') = 'number'
        then (b->'quoted_usd'->>'workshop_make_creative')::numeric else 0 end
      + case when jsonb_typeof(b->'quoted_usd'->'workshop_make_stills') = 'number'
        then (b->'quoted_usd'->>'workshop_make_stills')::numeric else 0 end as pictures
      from budget
  )
  select coalesce((
    select amounts.cap > 0
       and amounts.pictures + coalesce((
             select sum(run.cost_usd)
               from public.marketing_runs as run
              where run.item_id = p_item_id
                and run.kind in ('clip', 'voice', 'music', 'lipsync', 'render')
           ), 0) >= amounts.cap
      from amounts
  ), false);
$$;

revoke all on function public.workshop_budget_used_up(uuid) from public, anon, authenticated;
grant execute on function public.workshop_budget_used_up(uuid) to service_role;

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

  -- budget: a paid job no provider has taken yet is not handed out once the project's recorded
  -- spend has reached its approved budget. It fails as a scene that could not be made does.
  for v_over in
    update public.marketing_runs as waiting
       set status = 'failed',
           finished_at = now(),
           error = 'התקציב שאושר לפרויקט נוצל: ההוצאה בפועל כבר הגיעה אליו, ולכן השלב הזה לא הופעל. כדי להמשיך צריך להגדיל את התקציב.'
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
       and public.workshop_budget_used_up(waiting.item_id)
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
