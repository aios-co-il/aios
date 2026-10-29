-- Assigning a client from the workshop works on workshop projects only, never on other work items.

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
  v_pipeline uuid;
  v_stage uuid;
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'workshop_assign_client: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  if not (coalesce(v_item.payload, '{}'::jsonb) ? 'workshop') then
    raise exception 'workshop_assign_client: work item % is not a workshop project', p_item_id using errcode = '22023';
  end if;

  if p_client_id is null then
    update public.marketing_work_items
       set client_id = null, pipeline_id = null, current_stage_id = null
     where id = p_item_id
    returning * into v_item;
    return v_item;
  end if;

  select s.pipeline_id, s.stage_id into v_pipeline, v_stage
    from public.workshop_creative_stage(v_item.tenant_id, p_client_id) s;

  update public.marketing_work_items
     set client_id = p_client_id, pipeline_id = v_pipeline, current_stage_id = v_stage
   where id = p_item_id
  returning * into v_item;
  return v_item;
end;
$$;

grant execute on function public.workshop_assign_client(uuid, uuid) to authenticated, service_role;
