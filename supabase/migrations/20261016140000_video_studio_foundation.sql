-- Carmen Video Studio, phase 1: scene table, video run tracking, private media buckets.
-- Scenes leave payload.storyboard because still, clip and voice jobs update a scene in
-- parallel; one JSON blob written by three processes would lose updates.
-- Idempotent and additive (no DROP/DELETE/REVOKE), so it re-runs safely on Staging and Production.

-- ── Scene status ─────────────────────────────────────────────────────────────
do $$
begin
  create type public.marketing_video_scene_status as enum (
    'draft',
    'still_generating',
    'still_ready',
    'still_approved',
    'clip_generating',
    'clip_ready',
    'clip_approved',
    'failed'
  );
exception when duplicate_object then null;
end $$;

-- ── marketing_video_scenes ───────────────────────────────────────────────────
create table if not exists public.marketing_video_scenes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.marketing_work_items(id) on delete cascade,
  -- numeric so a drag between two scenes can take the midpoint without renumbering.
  position numeric not null,
  title text not null default '',
  shot text not null default 'Medium shot',
  visual_prompt text not null default '',
  motion_prompt text not null default '',
  overlay_text text not null default '',
  voiceover_text text not null default '',
  duration_s numeric(6,2) not null default 3 check (duration_s > 0 and duration_s <= 120),
  -- Horizontal focus point (percent) used when cropping to 1:1 and 9:16.
  focal_x numeric(5,2) not null default 50 check (focal_x between 0 and 100),
  still_asset_id uuid references public.marketing_assets(id) on delete set null,
  clip_asset_id uuid references public.marketing_assets(id) on delete set null,
  voice_asset_id uuid references public.marketing_assets(id) on delete set null,
  status public.marketing_video_scene_status not null default 'draft',
  -- The clip was animated from an older still or prompt and needs to be animated again.
  clip_stale boolean not null default false,
  locked boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_video_scenes_item_position_idx
  on public.marketing_video_scenes (item_id, position);
create index if not exists marketing_video_scenes_tenant_idx
  on public.marketing_video_scenes (tenant_id);

alter table public.marketing_video_scenes enable row level security;

grant select, insert, update, delete on public.marketing_video_scenes to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_video_scenes' and policyname = 'marketing_video_scenes_select') then
    create policy marketing_video_scenes_select on public.marketing_video_scenes for select to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_video_scenes' and policyname = 'marketing_video_scenes_insert') then
    create policy marketing_video_scenes_insert on public.marketing_video_scenes for insert to authenticated
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_video_scenes' and policyname = 'marketing_video_scenes_update') then
    create policy marketing_video_scenes_update on public.marketing_video_scenes for update to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())))
      with check (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_video_scenes' and policyname = 'marketing_video_scenes_delete') then
    create policy marketing_video_scenes_delete on public.marketing_video_scenes for delete to authenticated
      using (tenant_id in (select tenant_id from public.tenant_users where user_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));
  end if;
end $$;

create or replace trigger marketing_video_scenes_updated_at
  before update on public.marketing_video_scenes
  for each row execute function public.update_updated_at_column();

-- Keeps a scene inside its project's tenant and tracks what a prompt or still edit invalidates.
create or replace function public.marketing_video_scenes_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if tg_op = 'INSERT' or new.item_id is distinct from old.item_id or new.tenant_id is distinct from old.tenant_id then
    select tenant_id into v_tenant from public.marketing_work_items where id = new.item_id;
    if v_tenant is null or v_tenant <> new.tenant_id then
      raise exception 'marketing_video_scenes: work item % is not in tenant %', new.item_id, new.tenant_id
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.visual_prompt is distinct from old.visual_prompt and new.still_asset_id is not distinct from old.still_asset_id then
      new.status := 'draft';
    end if;
    if new.clip_asset_id is distinct from old.clip_asset_id then
      new.clip_stale := false;
    elsif new.clip_asset_id is not null
      and (new.visual_prompt is distinct from old.visual_prompt or new.still_asset_id is distinct from old.still_asset_id) then
      new.clip_stale := true;
    end if;
  end if;

  return new;
end;
$$;

create or replace trigger marketing_video_scenes_guard
  before insert or update on public.marketing_video_scenes
  for each row execute function public.marketing_video_scenes_guard();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketing_video_scenes'
    ) then
    alter publication supabase_realtime add table public.marketing_video_scenes;
  end if;
end $$;

-- ── marketing_runs: one row per external provider call ───────────────────────
alter table public.marketing_runs
  add column if not exists kind text,
  add column if not exists scene_id uuid references public.marketing_video_scenes(id) on delete set null,
  add column if not exists provider text,
  add column if not exists provider_job_id text,
  add column if not exists credits numeric,
  add column if not exists attempts integer not null default 0;

do $$
begin
  alter table public.marketing_runs add constraint marketing_runs_kind_check
    check (kind is null or kind in ('still', 'clip', 'voice', 'music', 'render', 'reference_analysis'));
exception when duplicate_object then null;
end $$;

create index if not exists marketing_runs_scene_idx
  on public.marketing_runs (scene_id) where scene_id is not null;
create unique index if not exists marketing_runs_provider_job_idx
  on public.marketing_runs (provider, provider_job_id) where provider_job_id is not null;

-- ── marketing_assets: scene versions (video_still, video_clip, voiceover, ...) ─
create index if not exists marketing_assets_scene_idx
  on public.marketing_assets ((meta->>'scene_id')) where meta ? 'scene_id';

-- ── Editor save: text fields and order only ──────────────────────────────────
-- Status and asset links belong to the generation jobs, so a storyboard save never
-- overwrites them. Removing a scene is a separate delete on the table (RLS-scoped).
create or replace function public.save_video_storyboard(p_item_id uuid, p_scenes jsonb)
returns setof public.marketing_video_scenes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.marketing_work_items where id = p_item_id;
  if v_tenant is null then
    raise exception 'save_video_storyboard: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_scenes) is distinct from 'array' then
    raise exception 'save_video_storyboard: p_scenes must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_scenes) as scene
     where coalesce(scene->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'save_video_storyboard: every scene needs a uuid id' using errcode = '22023';
  end if;

  insert into public.marketing_video_scenes as existing (
    id, tenant_id, item_id, position, title, shot, visual_prompt, overlay_text, voiceover_text, duration_s, meta
  )
  select
    (scene->>'id')::uuid,
    v_tenant,
    p_item_id,
    coalesce((scene->>'position')::numeric, ord),
    coalesce(scene->>'title', ''),
    coalesce(nullif(scene->>'shot', ''), 'Medium shot'),
    coalesce(scene->>'visual_prompt', ''),
    coalesce(scene->>'overlay_text', ''),
    coalesce(scene->>'voiceover_text', ''),
    least(greatest(coalesce((scene->>'duration_s')::numeric, 3), 0.5), 120),
    case when jsonb_typeof(scene->'canvas') = 'object' then jsonb_build_object('canvas', scene->'canvas') else '{}'::jsonb end
  from jsonb_array_elements(p_scenes) with ordinality as input(scene, ord)
  on conflict (id) do update set
    position = excluded.position,
    title = excluded.title,
    shot = excluded.shot,
    visual_prompt = excluded.visual_prompt,
    overlay_text = excluded.overlay_text,
    voiceover_text = excluded.voiceover_text,
    duration_s = excluded.duration_s,
    meta = existing.meta || excluded.meta
  where existing.item_id = p_item_id;

  return query
    select * from public.marketing_video_scenes where item_id = p_item_id order by position;
end;
$$;

grant execute on function public.save_video_storyboard(uuid, jsonb) to authenticated, service_role;

-- ── New scene file version: asset row + scene link in one transaction ────────
create or replace function public.attach_video_scene_asset(
  p_scene_id uuid,
  p_kind text,
  p_url text,
  p_meta jsonb default '{}'::jsonb,
  p_run_id uuid default null
)
returns public.marketing_assets
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_scene public.marketing_video_scenes;
  v_type text;
  v_version integer;
  v_stage uuid;
  v_asset public.marketing_assets;
begin
  v_type := case p_kind
    when 'still' then 'video_still'
    when 'clip' then 'video_clip'
    when 'voice' then 'voiceover'
  end;
  if v_type is null then
    raise exception 'attach_video_scene_asset: unknown kind %', p_kind using errcode = '22023';
  end if;
  if coalesce(p_url, '') = '' then
    raise exception 'attach_video_scene_asset: url is required' using errcode = '22023';
  end if;

  select * into v_scene from public.marketing_video_scenes where id = p_scene_id for update;
  if not found then
    raise exception 'attach_video_scene_asset: scene % not found', p_scene_id using errcode = 'P0002';
  end if;

  select coalesce(max((meta->>'version')::integer), 0) + 1
    into v_version
    from public.marketing_assets
   where item_id = v_scene.item_id
     and type = v_type
     and meta->>'scene_id' = p_scene_id::text
     and meta->>'version' ~ '^[0-9]+$';

  select current_stage_id into v_stage from public.marketing_work_items where id = v_scene.item_id;

  insert into public.marketing_assets (tenant_id, item_id, run_id, stage_id, type, url, meta)
  values (
    v_scene.tenant_id,
    v_scene.item_id,
    p_run_id,
    v_stage,
    v_type,
    p_url,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('scene_id', p_scene_id, 'version', v_version, 'approved', false)
  )
  returning * into v_asset;

  update public.marketing_video_scenes
     set still_asset_id = case when p_kind = 'still' then v_asset.id else still_asset_id end,
         clip_asset_id = case when p_kind = 'clip' then v_asset.id else clip_asset_id end,
         voice_asset_id = case when p_kind = 'voice' then v_asset.id else voice_asset_id end,
         status = case p_kind
           when 'still' then 'still_ready'::public.marketing_video_scene_status
           when 'clip' then 'clip_ready'::public.marketing_video_scene_status
           else status
         end
   where id = p_scene_id;

  return v_asset;
end;
$$;

grant execute on function public.attach_video_scene_asset(uuid, text, text, jsonb, uuid) to authenticated, service_role;

-- ── Private buckets ──────────────────────────────────────────────────────────
-- creative-video: tenant_id/client_id/item_id/scene_id/<kind>-v<n>.<ext>, signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-video',
  'creative-video',
  false,
  209715200,
  array[
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
    'image/png', 'image/jpeg', 'image/webp',
    'application/json', 'text/vtt'
  ]
)
on conflict (id) do nothing;

-- carmen-save-media writes here; its storage policies already exist.
insert into storage.buckets (id, name, public)
values ('carmen-media', 'carmen-media', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creative_video_select') then
    create policy creative_video_select on storage.objects for select to authenticated
      using (
        bucket_id = 'creative-video'
        and (
          (storage.foldername(name))[1] in (select tenant_id::text from public.tenant_users where user_id = (select auth.uid()))
          or public.is_super_admin((select auth.uid()))
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creative_video_insert') then
    create policy creative_video_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'creative-video'
        and (storage.foldername(name))[1] in (select tenant_id::text from public.tenant_users where user_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creative_video_update') then
    create policy creative_video_update on storage.objects for update to authenticated
      using (
        bucket_id = 'creative-video'
        and (storage.foldername(name))[1] in (select tenant_id::text from public.tenant_users where user_id = (select auth.uid()))
      )
      with check (
        bucket_id = 'creative-video'
        and (storage.foldername(name))[1] in (select tenant_id::text from public.tenant_users where user_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creative_video_remove') then
    create policy creative_video_remove on storage.objects for delete to authenticated
      using (
        bucket_id = 'creative-video'
        and (storage.foldername(name))[1] in (select tenant_id::text from public.tenant_users where user_id = (select auth.uid()))
      );
  end if;
end $$;

-- ── One-time move: payload.storyboard → marketing_video_scenes ───────────────
-- Skips projects that already have scenes, so it is safe to re-run (for example after
-- the Staging mirror brings in a storyboard created on Production before release).
-- payload.storyboard is left in place as a frozen backup; the editor no longer reads it.
create or replace function public.migrate_storyboard_to_video_scenes(p_item_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_frame record;
  v_scene_id uuid;
  v_asset_id uuid;
  v_url text;
  v_position integer;
  v_count integer := 0;
begin
  for v_item in
    select w.id, w.tenant_id, w.current_stage_id, w.payload
      from public.marketing_work_items w
     where (p_item_id is null or w.id = p_item_id)
       and jsonb_typeof(w.payload->'storyboard') = 'array'
       and jsonb_array_length(w.payload->'storyboard') > 0
       and not exists (select 1 from public.marketing_video_scenes s where s.item_id = w.id)
  loop
    v_position := 0;
    for v_frame in
      select frame, ord
        from jsonb_array_elements(v_item.payload->'storyboard') with ordinality as input(frame, ord)
       where jsonb_typeof(frame) = 'object'
       order by
         case when frame->>'order' ~ '^-?[0-9]+(\.[0-9]+)?$' then (frame->>'order')::numeric end nulls last,
         ord
    loop
      v_position := v_position + 1;
      v_scene_id := case
        when v_frame.frame->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (v_frame.frame->>'id')::uuid
        else gen_random_uuid()
      end;
      if exists (select 1 from public.marketing_video_scenes where id = v_scene_id) then
        v_scene_id := gen_random_uuid();
      end if;

      insert into public.marketing_video_scenes (
        id, tenant_id, item_id, position, title, shot, visual_prompt, overlay_text, voiceover_text, duration_s, meta
      )
      values (
        v_scene_id,
        v_item.tenant_id,
        v_item.id,
        v_position,
        coalesce(v_frame.frame->>'title', ''),
        coalesce(nullif(v_frame.frame->>'shot', ''), 'Medium shot'),
        coalesce(v_frame.frame->>'visualPrompt', ''),
        coalesce(v_frame.frame->>'overlayText', ''),
        coalesce(v_frame.frame->>'voiceover', ''),
        case
          when v_frame.frame->>'duration' ~ '^[0-9]+(\.[0-9]+)?$'
            then least(greatest((v_frame.frame->>'duration')::numeric, 0.5), 120)
          else 3
        end,
        jsonb_build_object(
          'source', 'payload_storyboard',
          'canvas', jsonb_strip_nulls(jsonb_build_object('x', v_frame.frame->'x', 'y', v_frame.frame->'y'))
        )
      );

      v_url := nullif(v_frame.frame->>'imageUrl', '');
      if v_url is not null then
        insert into public.marketing_assets (tenant_id, item_id, stage_id, type, url, meta)
        values (
          v_item.tenant_id,
          v_item.id,
          v_item.current_stage_id,
          'video_still',
          v_url,
          jsonb_strip_nulls(jsonb_build_object(
            'scene_id', v_scene_id,
            'version', 1,
            'approved', false,
            'source', 'payload_storyboard',
            'generation_cost', v_frame.frame->'generationCost'
          ))
        )
        returning id into v_asset_id;

        update public.marketing_video_scenes
           set still_asset_id = v_asset_id, status = 'still_ready'
         where id = v_scene_id;
      end if;

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

select public.migrate_storyboard_to_video_scenes();
