-- A narration counts as ready only in the voice the project uses now (payload.video.voice_id,
-- which both the workshop and the Video Studio narrate with). Picking another voice narrates the
-- film again instead of replaying the old one. Speech made by a fallback with its own voice
-- names (Gemini) is not compared. Safe to re-run.

create or replace function public.video_voice_matches(p_meta jsonb, p_voice text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_voice is null
    or coalesce(p_meta->>'provider', 'elevenlabs') <> 'elevenlabs'
    or coalesce(p_meta->>'voice_id', '') = p_voice;
$$;

grant execute on function public.video_voice_matches(jsonb, text) to authenticated, service_role;

create or replace function public.video_narration_ready(p_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(v.script, '') = ''
    or (
      not v.talking
      and coalesce(v.latest_text, '') = v.script
      and public.video_voice_matches(v.latest_meta, v.voice)
    )
    or not exists (
      select 1
        from public.marketing_video_scenes as scene
        cross join lateral (
          select public.video_narration_line(scene.meta, scene.voiceover_text) as line
        ) as l
        left join public.marketing_assets as voice on voice.id = scene.voice_asset_id
       where scene.item_id = p_item_id
         and l.line <> ''
         and case
           when v.talking then not (
             coalesce(voice.type, '') = 'voiceover'
             and coalesce(voice.meta->>'text', '') = l.line
             and public.video_voice_matches(voice.meta, v.voice)
           )
           -- A continuous take counts only as the newest take of the whole script (above).
           when coalesce(voice.type, '') = 'narration' then true
           else not (
             coalesce(voice.meta->>'text', '') = l.line
             and public.video_voice_matches(voice.meta, v.voice)
           )
         end
    )
  from (
    select string_agg(l.line, ' ' order by scene.position) filter (where l.line <> '') as script,
           coalesce(bool_or(coalesce(scene.meta->>'lipsync', '') = 'true'), false) as talking,
           (
             select newest.meta->>'text'
               from public.marketing_assets as newest
              where newest.item_id = p_item_id
                and newest.type = 'narration'
                and newest.url is not null
              order by newest.created_at desc
              limit 1
           ) as latest_text,
           (
             select newest.meta
               from public.marketing_assets as newest
              where newest.item_id = p_item_id
                and newest.type = 'narration'
                and newest.url is not null
              order by newest.created_at desc
              limit 1
           ) as latest_meta,
           (
             select nullif(btrim(coalesce(item.payload->'video'->>'voice_id', '')), '')
               from public.marketing_work_items as item
              where item.id = p_item_id
           ) as voice
      from public.marketing_video_scenes as scene
      cross join lateral (
        select public.video_narration_line(scene.meta, scene.voiceover_text) as line
      ) as l
     where scene.item_id = p_item_id
  ) as v;
$$;
