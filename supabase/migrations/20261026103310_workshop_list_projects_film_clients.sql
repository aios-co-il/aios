-- The workshop list brings the film's format and edit flag with each row (payload.format and
-- payload.workshop_edit), so the board draws a film at its aspect and saves scene text in its
-- layout from the first render, with no second read of the payload. The return type changes,
-- so the function is dropped and created again with the grants and security of 20261026103300.
--
-- It also lists only the clients the workshop's client picker shows (ClientSelector: the
-- tenant's active clients), as AIO-235 asks. RLS alone let in a paused or ended client's items,
-- and those of another tenant's client seen through a shared agency.

drop function if exists public.workshop_list_projects(uuid, text, int);

create function public.workshop_list_projects(
  p_tenant_id uuid,
  p_client text default 'all',
  p_limit int default 200
)
returns table (
  id uuid,
  title text,
  status text,
  client_id uuid,
  client_name text,
  department_hint text,
  has_board boolean,
  project_type text,
  target_channel text,
  track text,
  stage_type text,
  has_copy boolean,
  has_creative boolean,
  has_seo_plan boolean,
  updated_at timestamptz,
  format text,
  workshop_edit boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_mode text := lower(coalesce(nullif(btrim(p_client), ''), 'all'));
  v_client uuid;
begin
  -- 'all' = every item, 'general' = items without a client, otherwise one client's uuid.
  if v_mode not in ('all', 'general') then
    if v_mode !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return;
    end if;
    v_client := v_mode::uuid;
    v_mode := 'client';
  end if;

  return query
  select
    w.id,
    w.title,
    w.status::text,
    w.client_id,
    c.name::text,
    w.payload->>'department',
    w.payload ? 'workshop',
    w.payload->>'project_type',
    w.target_channel,
    p.track,
    s.stage_type::text,
    w.payload ?| array['brief_text', 'copy_text', 'copy_chat', 'copy_concepts'],
    (w.payload ? 'variations')
      or coalesce(w.payload->>'project_type', '') in ('static', 'video')
      or (w.payload ? 'image_url'),
    w.payload ? 'seo_plan',
    w.updated_at,
    w.payload->>'format',
    coalesce(w.payload->'workshop_edit' = 'true'::jsonb, false)
  from public.marketing_work_items w
  left join public.clients c on c.id = w.client_id
  left join public.marketing_pipelines p on p.id = w.pipeline_id
  left join public.marketing_pipeline_stages s on s.id = w.current_stage_id
  where w.tenant_id = p_tenant_id
    and w.status <> 'archived'
    and (w.client_id is null or (c.tenant_id = p_tenant_id and c.status = 'active'))
    and case v_mode
      when 'all' then true
      when 'general' then w.client_id is null
      else w.client_id = v_client
    end
  order by w.updated_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.workshop_list_projects(uuid, text, int) from public, anon;
grant execute on function public.workshop_list_projects(uuid, text, int) to authenticated;
