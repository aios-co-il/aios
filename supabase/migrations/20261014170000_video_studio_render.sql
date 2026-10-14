-- Video Studio: queue one finished-film job from approved clips.
-- The worker assembles those clips with ffmpeg. No existing row is changed.

-- The original marketing_assets.type check only allowed copy/image/video/brief/data.
-- Stills, clips, voice, music, renders, reference videos, storyboards and SEO plans
-- are already written by the app, so that check is removed. Rows are left as they are.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint as con
      join pg_class as rel on rel.oid = con.conrelid
      join pg_namespace as nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'marketing_assets'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%''copy''%'
       and pg_get_constraintdef(con.oid) ilike '%''brief''%'
  loop
    execute format('alter table public.marketing_assets drop constraint %I', r.conname);
  end loop;
end $$;

create or replace function public.queue_video_render(
  p_item_id uuid,
  p_aspect text default '9:16',
  p_stage_id uuid default null
)
returns setof public.marketing_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.marketing_work_items;
  v_stage uuid;
  v_scenes jsonb;
  v_music text;
  v_version integer;
begin
  if p_aspect not in ('9:16', '16:9', '1:1', '4:5') then
    raise exception 'queue_video_render: unsupported aspect %', p_aspect using errcode = '22023';
  end if;
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'queue_video_render: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  v_stage := coalesce(p_stage_id, v_item.current_stage_id);
  if v_stage is null then
    raise exception 'queue_video_render: work item % has no stage', p_item_id using errcode = '22023';
  end if;

  if exists (
    select 1 from public.marketing_runs
     where item_id = p_item_id
       and kind = 'render'
       and status in ('queued', 'running')
  ) then
    return;
  end if;

  select coalesce(jsonb_agg(row_to_json(picked)::jsonb order by picked.position), '[]'::jsonb)
    into v_scenes
    from (
      select
        scene.id,
        scene.position,
        scene.overlay_text as "overlayText",
        scene.duration_s as "durationS",
        clip.url as "clipPath",
        voice.url as "voicePath"
      from public.marketing_video_scenes as scene
      join public.marketing_assets as clip on clip.id = scene.clip_asset_id
      left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
      where scene.item_id = p_item_id
        and scene.tenant_id = v_item.tenant_id
        and scene.status = 'clip_approved'
        and coalesce(clip.url, '') <> ''
      order by scene.position
    ) as picked;

  if jsonb_array_length(v_scenes) = 0 then
    raise exception 'queue_video_render: no approved clips' using errcode = '22023';
  end if;

  select url into v_music
    from public.marketing_assets
   where item_id = p_item_id
     and tenant_id = v_item.tenant_id
     and type = 'music'
     and coalesce(url, '') <> ''
   order by created_at desc
   limit 1;

  select count(*) + 1 into v_version
    from public.marketing_assets
   where item_id = p_item_id
     and type = 'render';

  return query
  insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
  values (
    v_item.tenant_id,
    p_item_id,
    v_stage,
    'render',
    'queued',
    'compose',
    jsonb_build_object(
      'client_id', v_item.client_id,
      'aspect', p_aspect,
      'musicPath', v_music,
      'version', v_version,
      'scenes', v_scenes
    )
  )
  returning *;
end;
$$;

grant execute on function public.queue_video_render(uuid, text, uuid) to authenticated, service_role;
