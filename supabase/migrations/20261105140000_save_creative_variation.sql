-- Save a tenant's creative project and optional image snapshot in one transaction under caller RLS.
create or replace function public.save_creative_variation(
  p_item_id uuid,
  p_tenant_id uuid,
  p_payload jsonb,
  p_stage_id uuid default null,
  p_url text default null,
  p_content text default null,
  p_meta jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.marketing_work_items
     set payload = p_payload
   where id = p_item_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'Creative project is unavailable for update' using errcode = 'P0002';
  end if;

  if p_meta is not null then
    insert into public.marketing_assets (tenant_id, item_id, stage_id, type, url, content, meta)
    values (p_tenant_id, p_item_id, p_stage_id, 'image', p_url, p_content, p_meta);
  end if;
  return p_item_id;
end;
$$;

revoke all on function public.save_creative_variation(uuid, uuid, jsonb, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_creative_variation(uuid, uuid, jsonb, uuid, text, text, jsonb)
  to authenticated;
