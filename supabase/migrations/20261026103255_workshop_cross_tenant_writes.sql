-- PR 932 review: no workshop write crosses tenants (TENANT_ISOLATION.md). Safe to re-run.
--
-- #25 workshop_fail_pending_film is security definer and found the pending film page by the
--     run's item_id alone. marketing_runs does not tie item_id to tenant_id, so a member of one
--     tenant could fail a render run naming another tenant's project and write their own text
--     into that tenant's film page (which Carmen quotes). It now reads the run's own tenant
--     only, as workshop_mirror_asset (20261026101800) and
--     workshop_fail_pending_films_on_production (20261026102500) already do.
-- #26 workshop_edit_scene_text is security invoker and relied on the marketing_video_scenes
--     update policy, which also lets a super admin change any tenant's scene. The board's edit
--     now changes a scene only for a member of the scene's own tenant; for anyone else, a super
--     admin included, the scene is "not found". The table's own update policy (20261016140000)
--     still lets a super admin change scenes directly; it predates this PR and is left as is.
--
-- Replaces (copied from their latest definitions, the changes marked "same tenant"):
--   workshop_fail_pending_film   (20261026100200_workshop_video.sql)
--   workshop_edit_scene_text     (20261026103240_workshop_scene_text_edit.sql)

-- ── #25 A failed render closes the pending film page of its own tenant only ─────
create or replace function public.workshop_fail_pending_film()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'render' and new.status = 'failed' and old.status is distinct from 'failed' then
    update public.workshop_artifacts
       set status = 'failed',
           meta = meta || jsonb_build_object('error', coalesce(new.error, 'ההרכבה נכשלה'))
     where id = (
       select id from public.workshop_artifacts
        where item_id = new.item_id
          and tenant_id = new.tenant_id -- same tenant
          and kind = 'film'
          and status = 'pending'
        order by created_at desc
        limit 1
     );
  end if;
  return new;
exception when others then
  raise warning 'workshop_fail_pending_film: %', sqlerrm;
  return new;
end;
$$;

-- ── #26 The board's scene text edit changes scenes of the caller's own tenant only ──
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
     -- same tenant: RLS also lets a super admin update any tenant's scene; the board does not.
     and scene.tenant_id in (
       select tu.tenant_id from public.tenant_users as tu where tu.user_id = (select auth.uid())
     )
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
