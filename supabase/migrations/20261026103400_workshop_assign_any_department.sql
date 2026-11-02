-- One assign path for every department (AIO-256). The workshop, Carmen and the department cards
-- assign, move and release a project with workshop_assign_client, whatever its department.
-- SEO and social projects stay with the client they were assigned to. The trigger at the end
-- enforces this only for projects with a seo_geo_programs row; social (and SEO without a
-- program) is locked in workshop_assign_client alone. 20261026103410 refines both.

-- The stage of one type in a client's pipeline of one track (or in the tenant's active "no client"
-- pipeline when p_client is null). Takes the oldest pipeline when a client has duplicates, the
-- way the department screens do, and creates the pipeline with the standard stages when missing:
-- the same stages as buildDefaultStages in src/components/marketing/lib/ensurePipeline.ts, named
-- and configured by the tenant's stage templates when it has them. Runs as the caller, so the
-- caller's RLS decides which clients and pipelines exist.
create or replace function public.workshop_department_stage(
  p_tenant uuid,
  p_client uuid,
  p_track text,
  p_stage_type text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pipeline uuid;
  v_stage uuid;
begin
  if p_track is null or p_track not in ('campaigns', 'seo_geo', 'social_organic') then
    raise exception 'מסלול עבודה לא מוכר: %', coalesce(p_track, '(ריק)') using errcode = '22023';
  end if;
  if p_stage_type is null or p_stage_type not in (
    'strategy', 'copy', 'creative', 'target_paid', 'target_seo', 'target_organic', 'measurement'
  ) then
    raise exception 'שלב עבודה לא מוכר: %', coalesce(p_stage_type, '(ריק)') using errcode = '22023';
  end if;
  if p_client is not null and not exists (
    select 1 from public.clients where id = p_client and tenant_id = p_tenant
  ) then
    raise exception 'הלקוח לא נמצא בחשבון הזה, או שאין לך גישה אליו' using errcode = '42501';
  end if;

  select p.id into v_pipeline
    from public.marketing_pipelines p
   where p.tenant_id = p_tenant
     and p.track = p_track
     and p.client_id is not distinct from p_client
     and (p_client is not null or p.is_active)
   order by p.created_at, p.id
   limit 1;

  if v_pipeline is null then
    begin
      insert into public.marketing_pipelines (tenant_id, client_id, track, name, is_active)
      values (
        p_tenant,
        p_client,
        p_track,
        case when p_client is null then 'ללא לקוח' else 'מחלקת שיווק' end,
        true
      )
      returning id into v_pipeline;
    exception when unique_violation then
      -- Only the "no client" pipeline is unique per track: another call created it first.
      select p.id into v_pipeline
        from public.marketing_pipelines p
       where p.tenant_id = p_tenant
         and p.track = p_track
         and p.client_id is not distinct from p_client
         and (p_client is not null or p.is_active)
       order by p.created_at, p.id
       limit 1;
    end;
  end if;

  if not exists (
    select 1 from public.marketing_pipeline_stages s where s.pipeline_id = v_pipeline
  ) then
    insert into public.marketing_pipeline_stages
      (pipeline_id, tenant_id, stage_type, name, agent_id, sort_order, position_x, position_y,
       approval_mode, configuration)
    select v_pipeline, p_tenant, d.stage_type::public.marketing_stage_type,
           coalesce(t.name, d.name), t.default_agent_id, d.sort_order,
           (5 - d.sort_order) * 280 - 280, 200,
           case when t.default_approval_mode in ('manual', 'auto', 'hybrid')
                then t.default_approval_mode else 'manual' end::public.marketing_approval_mode,
           case when t.id is null then '{}'::jsonb
                else jsonb_build_object(
                  'instructions', coalesce(t.default_instructions, ''),
                  'tools', coalesce(t.default_tools, '[]'::jsonb),
                  'target', coalesce(t.default_target, '{}'::jsonb)
                ) end
      from (values
        ('strategy', 'בריף', 0),
        ('copy', 'כתיבת תוכן', 1),
        ('creative', 'קריאייטיב', 2),
        (case p_track when 'seo_geo' then 'target_seo'
                      when 'social_organic' then 'target_organic'
                      else 'target_paid' end,
         case p_track when 'seo_geo' then 'SEO / GEO'
                      when 'social_organic' then 'סושיאל אורגני'
                      else 'קמפיין ממומן' end,
         3),
        ('measurement', 'מדידה', 4)
      ) as d(stage_type, name, sort_order)
      left join lateral (
        select st.*
          from public.marketing_stage_templates st
         where st.tenant_id = p_tenant and st.track = p_track and st.stage_type = d.stage_type
         order by st.created_at, st.id
         limit 1
      ) t on true;
  end if;

  select s.id into v_stage
    from public.marketing_pipeline_stages s
   where s.pipeline_id = v_pipeline and s.stage_type = p_stage_type::public.marketing_stage_type
   order by s.sort_order, s.created_at, s.id
   limit 1;
  if v_stage is null then
    raise exception 'בתהליך העבודה של הלקוח אין שלב "%"', case p_stage_type
        when 'strategy' then 'בריף' when 'copy' then 'כתיבת תוכן' when 'creative' then 'קריאייטיב'
        when 'target_paid' then 'קמפיין ממומן' when 'target_seo' then 'SEO / GEO'
        when 'target_organic' then 'סושיאל אורגני' else 'מדידה' end
      using errcode = 'P0002';
  end if;
  return v_stage;
end;
$$;

revoke all on function public.workshop_department_stage(uuid, uuid, text, text) from public, anon;
grant execute on function public.workshop_department_stage(uuid, uuid, text, text)
  to authenticated, service_role;

-- The creative stage of a client's campaigns pipeline (or of the active "no client" pipeline
-- when p_client_id is null). Kept for the workshop's start-project and production paths.
create or replace function public.workshop_creative_stage(
  p_tenant_id uuid,
  p_client_id uuid default null
)
returns table (pipeline_id uuid, stage_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage uuid := public.workshop_department_stage(p_tenant_id, p_client_id, 'campaigns', 'creative');
begin
  return query
    select s.pipeline_id, s.id from public.marketing_pipeline_stages s where s.id = v_stage;
end;
$$;

grant execute on function public.workshop_creative_stage(uuid, uuid) to authenticated, service_role;

-- Assigns a project of any department to a client, moves it to another client, or releases it
-- (p_client_id null) to the tenant's "no client" pipeline of its track. Runs as the caller, as
-- before: RLS decides which item, clients and pipelines the caller can see.
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
  v_stage_type text;
  v_dept text;
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
  select p.track into v_track from public.marketing_pipelines p where p.id = v_item.pipeline_id;
  select s.stage_type::text into v_stage_type
    from public.marketing_pipeline_stages s where s.id = v_item.current_stage_id;

  -- The project's department. Mirrors projectDepartment in
  -- supabase/functions/_shared/workshop/departments.ts (keep the two in step): the tagged
  -- department, a workshop board, the pipeline track, the current stage, then the payload.
  v_dept := case
    when v_payload->>'department' in ('creative', 'copy', 'seo', 'social', 'web', 'campaigns')
      then v_payload->>'department'
    when v_payload ? 'workshop' then 'creative'
    when v_track = 'seo_geo' then 'seo'
    when v_track = 'social_organic' then 'social'
    when v_stage_type = 'copy' then 'copy'
    when v_stage_type = 'creative' then 'creative'
    when v_stage_type = 'target_seo' then 'seo'
    when v_stage_type = 'target_organic' then 'social'
    when v_stage_type = 'target_paid' then 'campaigns'
    when v_payload ? 'seo_plan' then 'seo'
    when v_payload ?| array['brief_text', 'copy_text', 'copy_chat', 'copy_concepts'] then 'copy'
    else 'creative'
  end;

  -- SEO and social projects stay with their client: their programs, sites and schedules belong
  -- to it. An unassigned one can still be assigned; assigning it to its own client changes nothing.
  if v_item.client_id is not null
     and (v_dept in ('seo', 'social')
          or exists (select 1 from public.seo_geo_programs g where g.work_item_id = v_item.id)) then
    if p_client_id is not distinct from v_item.client_id then
      return v_item;
    end if;
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

  -- The pipeline track and stage each department works in. There is no web track yet: a web
  -- project keeps its current track and stage type (in the target client's pipeline of that
  -- track), or goes to the campaigns creative stage when it has none.
  case v_dept
    when 'copy' then v_target_track := 'campaigns'; v_target_stage := 'copy';
    when 'campaigns' then v_target_track := 'campaigns'; v_target_stage := 'target_paid';
    when 'seo' then v_target_track := 'seo_geo'; v_target_stage := 'target_seo';
    when 'social' then v_target_track := 'social_organic'; v_target_stage := 'target_organic';
    when 'web' then
      if v_track in ('campaigns', 'seo_geo', 'social_organic') then
        v_target_track := v_track;
        v_target_stage := coalesce(v_stage_type, 'creative');
      else
        v_target_track := 'campaigns';
        v_target_stage := 'creative';
      end if;
    else v_target_track := 'campaigns'; v_target_stage := 'creative';
  end case;

  v_stage := public.workshop_department_stage(
    v_item.tenant_id, p_client_id, v_target_track, v_target_stage
  );
  select s.pipeline_id into v_pipeline from public.marketing_pipeline_stages s where s.id = v_stage;

  update public.marketing_work_items
     set client_id = p_client_id, pipeline_id = v_pipeline, current_stage_id = v_stage
   where id = p_item_id
  returning * into v_item;
  return v_item;
end;
$$;

grant execute on function public.workshop_assign_client(uuid, uuid) to authenticated, service_role;

-- An SEO project's program, keywords and calendar belong to its client, so the project never
-- changes client once it has one. Checked for every writer, the service role included; the
-- assign RPC refuses these moves before they get here. Only projects with a program: a social
-- project's lock lives in workshop_assign_client alone.
create or replace function public.marketing_work_items_seo_client_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.client_id is not null
     and new.client_id is distinct from old.client_id
     and exists (select 1 from public.seo_geo_programs g where g.work_item_id = old.id) then
    raise exception 'לפרויקט SEO / GEO יש תוכנית של הלקוח שלו: אי אפשר להעביר אותו ללקוח אחר או להסיר את השיוך'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.marketing_work_items_seo_client_lock() from public, anon, authenticated;

drop trigger if exists marketing_work_items_seo_client_lock on public.marketing_work_items;
create trigger marketing_work_items_seo_client_lock
  before update of client_id on public.marketing_work_items
  for each row execute function public.marketing_work_items_seo_client_lock();
