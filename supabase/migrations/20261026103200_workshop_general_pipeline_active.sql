-- The tenant's single "no client" pipeline is the active one. clone-entity-to-tenant copies a
-- pipeline into another tenant with no client and is_active = false, so the uniqueness covers
-- only active pipelines: inactive clones of the same track can coexist, and the workshop never
-- picks an inactive clone as its "no client" pipeline. is_active is NOT NULL DEFAULT true.

drop index if exists public.marketing_pipelines_tenant_general_track_idx;

create unique index marketing_pipelines_tenant_general_track_idx
  on public.marketing_pipelines (tenant_id, track)
  where client_id is null and is_active;

-- The creative stage of a client's campaigns pipeline (or of the active "no client" pipeline
-- when p_client_id is null). Creates the pipeline with its default stages when missing.
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
  v_pipeline uuid;
  v_stage uuid;
begin
  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and tenant_id = p_tenant_id
  ) then
    raise exception 'workshop_creative_stage: client % is not in tenant %', p_client_id, p_tenant_id
      using errcode = '42501';
  end if;

  select p.id into v_pipeline
    from public.marketing_pipelines p
   where p.tenant_id = p_tenant_id
     and p.track = 'campaigns'
     and p.client_id is not distinct from p_client_id
     and (p_client_id is not null or p.is_active)
   order by p.created_at
   limit 1;

  if v_pipeline is null then
    begin
      insert into public.marketing_pipelines (tenant_id, client_id, track, name, is_active)
      values (
        p_tenant_id,
        p_client_id,
        'campaigns',
        case when p_client_id is null then 'ללא לקוח' else 'מחלקת שיווק' end,
        true
      )
      returning id into v_pipeline;
    exception when unique_violation then
      select p.id into v_pipeline
        from public.marketing_pipelines p
       where p.tenant_id = p_tenant_id
         and p.track = 'campaigns'
         and p.client_id is not distinct from p_client_id
         and (p_client_id is not null or p.is_active)
       limit 1;
    end;
  end if;

  if not exists (
    select 1 from public.marketing_pipeline_stages s where s.pipeline_id = v_pipeline
  ) then
    insert into public.marketing_pipeline_stages
      (pipeline_id, tenant_id, stage_type, name, sort_order, position_x, position_y, approval_mode, configuration)
    select v_pipeline, p_tenant_id, d.stage_type::public.marketing_stage_type, d.name, d.sort_order,
           (5 - d.sort_order) * 280 - 280, 200, 'manual'::public.marketing_approval_mode, '{}'::jsonb
      from (values
        ('strategy', 'בריף', 0),
        ('copy', 'כתיבת תוכן', 1),
        ('creative', 'קריאייטיב', 2),
        ('target_paid', 'קמפיין ממומן', 3),
        ('measurement', 'מדידה', 4)
      ) as d(stage_type, name, sort_order);
  end if;

  select s.id into v_stage
    from public.marketing_pipeline_stages s
   where s.pipeline_id = v_pipeline and s.stage_type = 'creative'
   limit 1;
  if v_stage is null then
    raise exception 'workshop_creative_stage: pipeline % has no creative stage', v_pipeline
      using errcode = 'P0002';
  end if;

  return query select v_pipeline, v_stage;
end;
$$;

grant execute on function public.workshop_creative_stage(uuid, uuid) to authenticated, service_role;
