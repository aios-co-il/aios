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
-- Replaces save_video_storyboard (20261026103230_video_scene_reference.sql), with the addition
-- marked "production lock". Same arguments, meta keys and grants.

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
