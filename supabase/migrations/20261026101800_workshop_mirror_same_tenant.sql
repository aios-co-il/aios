-- The asset mirror reads the project, scene and pending pages of the asset's own tenant only,
-- and a clip page says which engine made it when the worker had to replace the chosen one.

create or replace function public.workshop_mirror_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_kind text;
  v_folder text;
  v_title text;
  v_scene record;
  v_pending uuid;
begin
  v_kind := case new.type
    when 'video_still' then 'scene_still'
    when 'video_clip' then 'clip'
    when 'narration' then 'narration'
    when 'music' then 'music'
    when 'render' then 'film'
    when 'reference_video' then 'reference'
    else null
  end;
  if v_kind is null or coalesce(new.url, '') = '' then
    return new;
  end if;

  select payload into v_payload
    from public.marketing_work_items
   where id = new.item_id and tenant_id = new.tenant_id;
  if v_payload is null or not (v_payload ? 'workshop') then
    return new;
  end if;

  if exists (
    select 1 from public.workshop_artifacts
     where ref_table = 'marketing_assets' and ref_id = new.id and tenant_id = new.tenant_id
  ) then
    return new;
  end if;

  v_folder := case v_kind
    when 'scene_still' then 'video/scenes'
    when 'clip' then 'video/scenes'
    when 'narration' then 'video/narration'
    when 'music' then 'video/music'
    when 'film' then 'video/film'
    else 'references'
  end;

  v_title := case v_kind
    when 'narration' then 'קריינות'
    when 'music' then 'מוזיקה'
    when 'film' then 'הסרט'
    when 'reference' then 'רפרנס'
    else ''
  end;

  if v_kind in ('scene_still', 'clip') and (new.meta ->> 'scene_id') is not null then
    select position, title into v_scene
      from public.marketing_video_scenes
     where id = (new.meta ->> 'scene_id')::uuid
       and item_id = new.item_id
       and tenant_id = new.tenant_id;
    if found then
      v_title := (case v_kind when 'clip' then 'הנפשה · סצנה ' else 'סצנה ' end)
        || trim(to_char(v_scene.position, 'FM999990.##'), '.')
        || case when coalesce(v_scene.title, '') <> '' then ' · ' || v_scene.title else '' end;
    end if;
  end if;
  if v_title = '' then
    v_title := case v_kind when 'clip' then 'הנפשה' else 'תמונת סצנה' end;
  end if;

  if v_kind = 'scene_still' and (new.meta ->> 'scene_id') is not null then
    select id into v_pending
      from public.workshop_artifacts
     where item_id = new.item_id
       and tenant_id = new.tenant_id
       and kind = 'scene_still'
       and status = 'pending'
       and meta ->> 'scene_id' = new.meta ->> 'scene_id'
     order by created_at desc
     limit 1;
    if v_pending is not null then
      update public.workshop_artifacts
         set status = 'ready',
             url = new.url,
             thumb_url = new.url,
             ref_table = 'marketing_assets',
             ref_id = new.id,
             meta = (meta - 'placeholder') || jsonb_build_object('asset_id', new.id, 'asset_type', new.type)
       where id = v_pending;
      return new;
    end if;
  end if;

  if v_kind = 'film' then
    select id into v_pending
      from public.workshop_artifacts
     where item_id = new.item_id and tenant_id = new.tenant_id and kind = 'film' and status = 'pending'
     order by created_at desc
     limit 1;
    if v_pending is not null then
      update public.workshop_artifacts
         set status = 'ready',
             url = new.url,
             thumb_url = null,
             ref_table = 'marketing_assets',
             ref_id = new.id,
             meta = meta || jsonb_build_object('asset_id', new.id)
       where id = v_pending;
      return new;
    end if;
  end if;

  insert into public.workshop_artifacts
    (tenant_id, item_id, kind, folder, title, status, url, thumb_url, ref_table, ref_id, meta)
  values (
    new.tenant_id,
    new.item_id,
    v_kind,
    v_folder,
    v_title,
    'ready',
    new.url,
    case when v_kind in ('scene_still', 'reference') then new.url else null end,
    'marketing_assets',
    new.id,
    jsonb_build_object('asset_id', new.id, 'asset_type', new.type)
      || jsonb_strip_nulls(jsonb_build_object(
           'provider', new.meta ->> 'provider',
           'fallback_from', new.meta ->> 'fallback_from'
         ))
  );
  return new;
exception when others then
  raise warning 'workshop_mirror_asset: %', sqlerrm;
  return new;
end;
$$;
