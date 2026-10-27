-- AIO-224 / AIO-270: the board's scene text edit follows Carmen's rule for a changed line.
-- Replaces workshop_edit_scene_text (20261026103240_workshop_scene_text_edit.sql); the same
-- arguments, limits, meta merge and grants. Safe to re-run.
--
-- A changed line marks the clip stale exactly as workshop_update_scene does (scene-update.ts):
--   * a clip that says the line itself: a talking scene on an engine that speaks (ElevenLabs,
--     Higgsfield, OpenRouter: payload.video.scene_engine), not in the project's chosen voice;
--   * a clip that talked and has no line any more.
-- Otherwise the clip is kept and the next production records the line and lip-syncs it again
-- (queue_video_lipsync), priced in its quote. The user's own video (a clip with no picture) is
-- never made again. Before, the board marked nothing stale, so a one-pass clip that said the old
-- line went to a separate voice and lip-sync pass, a different film and price than the same
-- change through Carmen.
--
-- Security invoker, as before: RLS on marketing_video_scenes and marketing_work_items keeps the
-- scene and its film to the caller's tenant.

create or replace function public.workshop_edit_scene_text(
  p_scene_id uuid,
  p_overlay_text text default null,
  p_voiceover_text text default null,
  p_dialogue text default null
)
returns public.marketing_video_scenes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_before public.marketing_video_scenes;
  v_scene public.marketing_video_scenes;
  v_engine text;
  v_meta jsonb;
  v_voiceover text;
  v_line_before text;
  v_line_after text;
  v_stale boolean;
begin
  if p_overlay_text is null and p_voiceover_text is null and p_dialogue is null then
    raise exception 'workshop_edit_scene_text: nothing to change' using errcode = '22023';
  end if;

  select * into v_before
    from public.marketing_video_scenes as scene
   where scene.id = p_scene_id
   for update;
  if not found then
    raise exception 'workshop_edit_scene_text: scene % not found', p_scene_id using errcode = 'P0002';
  end if;
  select coalesce(item.payload->'video'->>'scene_engine', '')
    into v_engine
    from public.marketing_work_items as item
   where item.id = v_before.item_id;

  v_voiceover := coalesce(left(btrim(p_voiceover_text), 2000), v_before.voiceover_text);
  v_meta := case
    when p_dialogue is null then v_before.meta
    else coalesce(v_before.meta, '{}'::jsonb)
      || jsonb_build_object('dialogue', left(btrim(p_dialogue), 1000))
  end;
  v_line_before := public.video_talking_line(v_before.meta, v_before.voiceover_text);
  v_line_after := public.video_talking_line(v_meta, v_voiceover);
  v_stale := v_before.clip_asset_id is not null
    and v_before.still_asset_id is not null
    and v_line_before is distinct from v_line_after
    and (
      v_line_after = ''
      or (
        coalesce(v_meta->>'chosen_voice', '') <> 'true'
        and v_engine in ('elevenlabs', 'higgsfield', 'openrouter')
      )
    );

  update public.marketing_video_scenes as scene
     set overlay_text = coalesce(left(btrim(p_overlay_text), 300), scene.overlay_text),
         voiceover_text = v_voiceover,
         meta = v_meta,
         clip_stale = scene.clip_stale or v_stale
   where scene.id = p_scene_id
  returning scene.* into v_scene;
  return v_scene;
end;
$$;

revoke all on function public.workshop_edit_scene_text(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.workshop_edit_scene_text(uuid, text, text, text) to authenticated;
