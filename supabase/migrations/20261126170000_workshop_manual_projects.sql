-- Workshop projects the user manages by hand (AIO-681): create one with a name and a type, rename
-- it, and archive it. Carmen opens projects with workshop_start_project; these RPCs give the board
-- the same row without a chat turn. All three are security invoker, so the marketing_work_items
-- policies decide who may write: a member of the tenant, for its own projects.

-- Opens a workshop project named p_title of kind p_kind (video, static, campaign or landing) for
-- the caller's tenant, assigned to p_client_id when given, and returns its id. The payload is the
-- one Carmen's planner writes for a request that names nothing but the title: planProject and
-- briefPayload in supabase/functions/_shared/workshop/defaults.ts and scene-helpers.ts (keep the
-- two in step), with intake_source 'manual'.
create or replace function public.workshop_create_project(
  p_tenant_id uuid,
  p_title text,
  p_kind text,
  p_client_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_type text;
  v_format text;
  v_film jsonb;
  v_id uuid;
begin
  if v_title = '' then
    raise exception 'לפרויקט צריך שם' using errcode = '22023';
  end if;
  if length(v_title) > 200 then
    raise exception 'שם הפרויקט ארוך מדי' using errcode = '22023';
  end if;
  if v_kind not in ('video', 'static', 'campaign', 'landing') then
    raise exception 'סוג פרויקט לא מוכר: %', p_kind using errcode = '22023';
  end if;

  -- planProject for a brief with no format or length in it: a 15 s vertical film in 5 scenes,
  -- or square creative.
  v_type := case v_kind when 'video' then 'video' when 'landing' then 'landing' else 'static' end;
  v_format := case v_kind when 'video' then '9:16' else '1:1' end;
  v_film := case
    when v_kind = 'video'
      then jsonb_build_object('totalSeconds', 15, 'scenes', 5, 'sceneSeconds', 3)
    else 'null'::jsonb
  end;

  insert into public.marketing_work_items (tenant_id, title, status, target_channel, payload, created_by)
  values (
    p_tenant_id,
    v_title,
    'draft',
    case v_type when 'static' then 'creative' else v_type end,
    jsonb_build_object(
      'brief_text', v_title,
      'format', v_format,
      'project_type', v_type,
      'visual_style', 'adaptive',
      'content_type', case v_kind when 'video' then 'script' else 'posts' end,
      'department', case v_kind when 'landing' then 'web' else 'creative' end,
      'intake_source', 'manual',
      'workshop', jsonb_build_object(
        'kind', v_kind,
        'formats', jsonb_build_array(v_format),
        'film', v_film
      )
    ),
    auth.uid()
  )
  returning id into v_id;

  -- The client's pipeline and stage come from the one assign path every department uses.
  if p_client_id is not null then
    perform public.workshop_assign_client(v_id, p_client_id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.workshop_create_project(uuid, text, text, uuid) from public, anon;
grant execute on function public.workshop_create_project(uuid, text, text, uuid) to authenticated;

-- Renames a project the caller can update; refuses an empty or overlong name and a project the
-- caller cannot see.
create or replace function public.workshop_rename_project(p_item_id uuid, p_title text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
begin
  if v_title = '' then
    raise exception 'לפרויקט צריך שם' using errcode = '22023';
  end if;
  if length(v_title) > 200 then
    raise exception 'שם הפרויקט ארוך מדי' using errcode = '22023';
  end if;
  update public.marketing_work_items set title = v_title where id = p_item_id;
  if not found then
    raise exception 'הפרויקט לא נמצא' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.workshop_rename_project(uuid, text) from public, anon;
grant execute on function public.workshop_rename_project(uuid, text) to authenticated;

-- Archives a project the caller can update: it leaves the workshop list (workshop_list_projects
-- skips archived rows) and keeps its scenes, assets and files.
create or replace function public.workshop_archive_project(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.marketing_work_items set status = 'archived' where id = p_item_id;
  if not found then
    raise exception 'הפרויקט לא נמצא' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.workshop_archive_project(uuid) from public, anon;
grant execute on function public.workshop_archive_project(uuid) to authenticated;
