-- PR 932 review: the board's scene text edit keeps both of its fixes. Safe to re-run.
--
-- 20261026103251_workshop_scene_text_edit_rules (Carmen's rules for a changed scene: no edit
-- while the film is being produced, a changed line marks the clip stale as workshop_update_scene
-- does) and 20261026103255_workshop_cross_tenant_writes (#26: only a member of the scene's own
-- tenant changes it) each replaced workshop_edit_scene_text from 20261026103240. Applied in
-- order, 103255 dropped the rules of 103251. This definition is 103251's with 103255's member
-- check, marked "same tenant": the scene is looked up for a member of its own tenant only, so
-- anyone else, a super admin included, gets "not found" before any other check.
--
-- Security invoker, as before: RLS of marketing_video_scenes and marketing_work_items also
-- applies. Same arguments, limits, meta merge and grants.

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
  v_production jsonb;
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
     -- same tenant: RLS also lets a super admin update any tenant's scene; the board does not.
     and scene.tenant_id in (
       select tu.tenant_id from public.tenant_users as tu where tu.user_id = (select auth.uid())
     )
   for update;
  if not found then
    raise exception 'workshop_edit_scene_text: scene % not found', p_scene_id using errcode = 'P0002';
  end if;
  select coalesce(item.payload->'video'->>'scene_engine', ''),
         item.payload->'video'->'production'
    into v_engine, v_production
    from public.marketing_work_items as item
   where item.id = v_before.item_id;
  if coalesce(v_production->>'status', '') = 'running'
     and coalesce((v_production->>'started_at')::timestamptz, now()) > now() - interval '1 hour' then
    raise exception 'workshop_edit_scene_text: the film is being produced'
      using errcode = '55006';
  end if;

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
