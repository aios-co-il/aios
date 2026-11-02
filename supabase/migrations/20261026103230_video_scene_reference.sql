-- Video Studio: a scene's own character picture. Additive and safe to re-run.
--
-- workshop_storyboard may give a scene meta.reference_url: an https picture of the character as
-- she looks in that scene only (e.g. the skin Carmen wears for the capability she presents).
-- workshop_make_stills then makes that scene's still from this picture instead of the project's
-- anchor frame. save_video_storyboard kept only the meta keys it knows, so it dropped the key.
--
-- Replaces save_video_storyboard (20261026102300_video_lipsync.sql), with the addition marked
-- "reference". An update merges meta as before, so the studio editor, which does not send the
-- key, keeps a scene's picture.

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

grant execute on function public.save_video_storyboard(uuid, jsonb) to authenticated, service_role;
