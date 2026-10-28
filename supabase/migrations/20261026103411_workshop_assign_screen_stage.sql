-- PR 959 review (AIO-256): a moved or assigned project lands where its department's screen lists
-- it. Replaces the body of workshop_assign_client from 20261026103410; the SEO lock trigger is
-- unchanged. Safe to re-run.
-- 20261026103410 kept a project's stage type on every move, which could drop it off every screen:
-- an untagged seo_geo project without a plan at a stage other than target_seo (the SEO screen
-- lists it only there), or a project that is Creative only by default at strategy or measurement
-- (the Creative screen lists it only at a creative stage). The workshop card still links to that
-- department's screen (departmentScreen of projectDepartment), which then does not show it.
-- Now the stage type is kept only where the screen lists the project at any stage; otherwise it
-- starts at the stage the screen lists it by, as 20261026103400 did.
-- Refusing a project with an SEO program now names the program's client. The workshop picker
-- cannot see the program, so it stays open for such a project when it has no client or is not
-- an SEO one, and the old "stays with its client" made no sense for a project with no client.

create or replace function public.workshop_assign_client(
  p_item_id uuid,
  p_client_id uuid default null
)
returns public.marketing_work_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_payload jsonb;
  v_track text;
  v_pipeline_client uuid;
  v_stage_type text;
  v_has_copy boolean;
  v_has_creative boolean;
  v_dept text;
  v_program_client uuid;
  v_program_client_name text;
  v_target_track text;
  v_target_stage text;
  v_listed_anywhere boolean;
  v_stage uuid;
  v_pipeline uuid;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'הפרויקט לא נמצא' using errcode = 'P0002';
  end if;
  v_payload := coalesce(v_item.payload, '{}'::jsonb);
  select p.track, p.client_id into v_track, v_pipeline_client
    from public.marketing_pipelines p where p.id = v_item.pipeline_id;
  select s.stage_type::text into v_stage_type
    from public.marketing_pipeline_stages s where s.id = v_item.current_stage_id;

  -- Already this client's, at a stage of its pipeline: nothing to do.
  if p_client_id is not distinct from v_item.client_id
     and v_stage_type is not null
     and v_item.pipeline_id is not null
     and v_pipeline_client is not distinct from p_client_id then
    return v_item;
  end if;

  -- The project's department. Mirrors projectDepartment in
  -- supabase/functions/_shared/workshop/departments.ts, and has_copy / has_creative in
  -- workshop_list_projects; supabase/tests/workshop_assign_client.sql repeats the cases of
  -- departments.test.ts by hand. The tagged department, a workshop board, the pipeline track, the
  -- current stage, then the payload. Creative work with a brief or copy is Creative.
  v_has_copy := v_payload ?| array['brief_text', 'copy_text', 'copy_chat', 'copy_concepts'];
  v_has_creative := (v_payload ? 'variations')
    or coalesce(v_payload->>'project_type', '') in ('static', 'video')
    or (v_payload ? 'image_url');
  v_dept := case
    when v_payload->>'department' in ('creative', 'copy', 'seo', 'social', 'web', 'campaigns')
      then v_payload->>'department'
    when v_payload ? 'workshop' then 'creative'
    when v_track = 'seo_geo' then 'seo'
    when v_track = 'social_organic' then 'social'
    when v_stage_type = 'copy' and v_has_creative then 'creative'
    when v_stage_type = 'copy' then 'copy'
    when v_stage_type = 'creative' then 'creative'
    when v_stage_type = 'target_seo' then 'seo'
    when v_stage_type = 'target_organic' then 'social'
    when v_stage_type = 'target_paid' then 'campaigns'
    when v_payload ? 'seo_plan' then 'seo'
    when v_has_copy and not v_has_creative then 'copy'
    else 'creative'
  end;

  -- A project with an SEO program takes only the program's client: its keywords, calendar and
  -- site belong to it. SEO and social projects stay with the client they have; an unassigned one
  -- can still be assigned. Only the program lock is also enforced by the trigger of 103410.
  -- The workshop picker is open for a project with a program but no client, or one whose
  -- department is not SEO (isClientLocked cannot see the program), so this refusal names the
  -- program's client: the only client the project can take.
  select g.client_id into v_program_client
    from public.seo_geo_programs g where g.work_item_id = v_item.id;
  if v_program_client is not null and p_client_id is distinct from v_program_client then
    select c.name into v_program_client_name from public.clients c where c.id = v_program_client;
    raise exception '%', case
        when v_program_client_name is null then
          'לפרויקט יש תוכנית SEO / GEO של לקוח שאין לך גישה אליו: אי אפשר לשייך אותו ללקוח אחר או להסיר את השיוך'
        else format(
          'לפרויקט יש תוכנית SEO / GEO של הלקוח "%s": אפשר לשייך אותו רק ללקוח הזה, ואי אפשר להסיר את השיוך',
          v_program_client_name)
      end
      using errcode = '22023';
  end if;
  if v_program_client is null
     and v_item.client_id is not null
     and v_dept in ('seo', 'social')
     and p_client_id is distinct from v_item.client_id then
    raise exception 'פרויקט % נשאר אצל הלקוח שלו: אי אפשר להעביר אותו ללקוח אחר או להסיר את השיוך',
      case when v_dept = 'social' then 'סושיאל' else 'SEO / GEO' end
      using errcode = '22023';
  end if;

  -- Moving or releasing takes the project away from its client: the caller must see that client.
  -- The service role (Carmen) bypasses RLS.
  if v_item.client_id is not null
     and p_client_id is distinct from v_item.client_id
     and not exists (select 1 from public.clients c where c.id = v_item.client_id) then
    raise exception 'אין לך גישה ללקוח שהפרויקט משויך אליו כרגע' using errcode = '42501';
  end if;

  -- The pipeline track each department works in, and the stage its screen lists it by. There is
  -- no web track yet: a web project keeps its current track.
  case v_dept
    when 'copy' then v_target_track := 'campaigns'; v_target_stage := 'copy';
    when 'campaigns' then v_target_track := 'campaigns'; v_target_stage := 'target_paid';
    when 'seo' then v_target_track := 'seo_geo'; v_target_stage := 'target_seo';
    when 'social' then v_target_track := 'social_organic'; v_target_stage := 'target_organic';
    when 'web' then
      v_target_track := case when v_track in ('campaigns', 'seo_geo', 'social_organic')
                             then v_track else 'campaigns' end;
      v_target_stage := 'creative';
    else v_target_track := 'campaigns'; v_target_stage := 'creative';
  end case;

  -- Does the department's screen list the project whatever its stage? Otherwise it lists it only
  -- at the stage above. JSON values count as JavaScript truthiness does in the screens:
  --   SEO (SeoGeoDepartment's item filter): tagged seo, or a seo_plan.
  --   Creative (isCreativeDepartmentItem, src/components/marketing/departmentFilters.ts): tagged
  --     creative, a copy handoff or copy link, a variations list, a static or video project, or a
  --     picture on an untagged project.
  --   Copy (isCopyDepartmentItem): tagged copy, or copy text on an untagged project.
  -- Social, web and campaigns have no screen yet: they keep their stage type.
  v_listed_anywhere := coalesce(case v_dept
    when 'seo' then v_payload->>'department' = 'seo'
      or coalesce(v_payload->'seo_plan', 'null') not in ('null', 'false', '0', '""')
    when 'creative' then v_payload->>'department' = 'creative'
      or v_payload->>'handoff_from' = 'copy'
      or v_payload->>'intake_source' = 'copy_link'
      or jsonb_typeof(v_payload->'variations') = 'array'
      or v_payload->>'project_type' in ('static', 'video')
      or (coalesce(v_payload->>'department', '') = ''
          and coalesce(v_payload->'image_url', 'null') not in ('null', 'false', '0', '""'))
    when 'copy' then v_payload->>'department' = 'copy'
      or (coalesce(v_payload->>'department', '') = '' and exists (
            select 1 from unnest(array['brief_text', 'copy_text', 'copy_chat', 'copy_concepts']) k
             where coalesce(v_payload->k, 'null') not in ('null', 'false', '0', '""')))
    else true
  end, false);

  -- Keep the stage type when the screen lists the project there, and the target track has it
  -- (every track has the four shared stages and its own target stage) and the target pipeline
  -- does: a customised pipeline may lack it.
  if v_listed_anywhere
     and (v_stage_type in ('strategy', 'copy', 'creative', 'measurement')
          or v_stage_type = (case v_target_track when 'seo_geo' then 'target_seo'
                                                 when 'social_organic' then 'target_organic'
                                                 else 'target_paid' end)) then
    begin
      v_stage := public.workshop_department_stage(
        v_item.tenant_id, p_client_id, v_target_track, v_stage_type
      );
    exception when no_data_found then
      v_stage := null;
    end;
  end if;
  if v_stage is null then
    v_stage := public.workshop_department_stage(
      v_item.tenant_id, p_client_id, v_target_track, v_target_stage
    );
  end if;
  select s.pipeline_id into v_pipeline from public.marketing_pipeline_stages s where s.id = v_stage;

  update public.marketing_work_items
     set client_id = p_client_id, pipeline_id = v_pipeline, current_stage_id = v_stage
   where id = p_item_id
  returning * into v_item;
  return v_item;
end;
$$;

revoke all on function public.workshop_assign_client(uuid, uuid) from public, anon;
grant execute on function public.workshop_assign_client(uuid, uuid) to authenticated, service_role;
