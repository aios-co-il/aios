-- AIO-270: the user edits a scene's text on the workshop board. Additive and safe to re-run.
--
-- The storyboard grid lets the user change three texts of one scene in place: the on-screen
-- text (overlay_text), the narration (voiceover_text) and, on a talking scene, the line the
-- character says (meta.dialogue). Only those change, and a null argument keeps its field.
-- meta is merged (meta || dialogue), so a key Carmen or the worker writes meanwhile survives.
-- The texts keep the limits of Carmen's workshop_update_scene (scene-update.ts LIMITS): 300
-- characters on screen, 2000 of narration, 1000 of dialogue.
--
-- Nothing is marked stale, as after a text change in the studio editor (save_video_storyboard):
-- the render reads the on-screen text when it assembles the film, and the next production
-- compares each voice and lip sync with the scene's current line (video_narration_ready,
-- queue_video_lipsync), so a changed narration or dialogue is spoken again then.
--
-- Security invoker: RLS on marketing_video_scenes keeps the scene to the caller's tenant, so a
-- scene of another tenant is "not found". Only the signed-in board calls it; the service role
-- (which bypasses RLS) has no use for it and is not granted it.

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
  v_scene public.marketing_video_scenes;
begin
  if p_overlay_text is null and p_voiceover_text is null and p_dialogue is null then
    raise exception 'workshop_edit_scene_text: nothing to change' using errcode = '22023';
  end if;

  update public.marketing_video_scenes as scene
     set overlay_text = coalesce(left(btrim(p_overlay_text), 300), scene.overlay_text),
         voiceover_text = coalesce(left(btrim(p_voiceover_text), 2000), scene.voiceover_text),
         meta = case
           when p_dialogue is null then scene.meta
           else coalesce(scene.meta, '{}'::jsonb)
             || jsonb_build_object('dialogue', left(btrim(p_dialogue), 1000))
         end
   where scene.id = p_scene_id
  returning scene.* into v_scene;

  if not found then
    raise exception 'workshop_edit_scene_text: scene % not found', p_scene_id using errcode = 'P0002';
  end if;
  return v_scene;
end;
$$;

revoke all on function public.workshop_edit_scene_text(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.workshop_edit_scene_text(uuid, text, text, text) to authenticated;
