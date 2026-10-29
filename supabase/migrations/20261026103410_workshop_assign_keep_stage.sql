-- PR 959 review (AIO-256): assigning a project keeps it where it is. Replaces the bodies of
-- workshop_assign_client and the SEO lock trigger from 20261026103400. Safe to re-run.
--   1. Assigning a project to the client it already has changes nothing, whatever its
--      department: picking the same client again in the card, or Carmen calling the RPC again,
--      rewound the project to its department's stage. A project without a stage still gets one.
--   2. Moving or releasing a project keeps its stage type when the other pipeline of the
--      department's track has it (a project being measured is still measured), as the copy and
--      creative screens do. Otherwise it starts at its department's stage, as before.
--   3. The department rule follows projectDepartment again (fix/review-953): creative work with
--      a brief or copy is Creative.
--   4. A project with an SEO program only ever takes the program's client, also once it lost
--      its client: in the RPC, and for every writer in the trigger.
-- What is locked where: the trigger enforces only projects with a seo_geo_programs row. SEO and
-- social projects without a program are locked only in workshop_assign_client, so a direct
-- update (the service role) can still move them.

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
  v_target_track text;
  v_target_stage text;
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
  -- workshop_list_projects (supabase/tests/workshop_assign_client.sql checks the cases of
  -- departments.test.ts): the tagged department, a workshop board, the pipeline track, the
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
  -- can still be assigned. Only the program lock is also enforced by the trigger below.
  select g.client_id into v_program_client
    from public.seo_geo_programs g where g.work_item_id = v_item.id;
  if (v_program_client is not null and p_client_id is distinct from v_program_client)
     or (v_program_client is null
         and v_item.client_id is not null
         and v_dept in ('seo', 'social')
         and p_client_id is distinct from v_item.client_id) then
    raise exception 'פרויקט % נשאר אצל הלקוח שלו: אי אפשר להעביר אותו ללקוח אחר או להסיר את השיוך',
      case when v_program_client is null and v_dept = 'social' then 'סושיאל' else 'SEO / GEO' end
      using errcode = '22023';
  end if;

  -- Moving or releasing takes the project away from its client: the caller must see that client.
  -- The service role (Carmen) bypasses RLS.
  if v_item.client_id is not null
     and p_client_id is distinct from v_item.client_id
     and not exists (select 1 from public.clients c where c.id = v_item.client_id) then
    raise exception 'אין לך גישה ללקוח שהפרויקט משויך אליו כרגע' using errcode = '42501';
  end if;

  -- The pipeline track each department works in, and the stage it starts at. There is no web
  -- track yet: a web project keeps its current track.
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

  -- Keep the stage type when that track has it (every track has the four shared stages and its
  -- own target stage), and the target pipeline does: a customised pipeline may lack it.
  if v_stage_type in ('strategy', 'copy', 'creative', 'measurement')
     or v_stage_type = (case v_target_track when 'seo_geo' then 'target_seo'
                                            when 'social_organic' then 'target_organic'
                                            else 'target_paid' end) then
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

-- A project with an SEO program only takes the program's client: moving it to another client,
-- releasing it, or giving a project that lost its client another one is refused. Checked for
-- every writer, the service role included. This is the only lock the database enforces: an SEO
-- or social project without a program is locked in workshop_assign_client alone.
create or replace function public.marketing_work_items_seo_client_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is distinct from old.client_id
     and exists (
       select 1 from public.seo_geo_programs g
        where g.work_item_id = old.id and g.client_id is distinct from new.client_id
     ) then
    raise exception 'לפרויקט SEO / GEO יש תוכנית של הלקוח שלו: אי אפשר להעביר אותו ללקוח אחר או להסיר את השיוך'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.marketing_work_items_seo_client_lock() from public, anon, authenticated;
