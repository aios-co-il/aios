-- video_narration_ready reads only the newest narration take, the one the render worker plays
-- (render-worker/src/jobs/render.mjs: newest narration, used only when its text is the script).
-- An older take with the right text no longer counts, so undoing a reorder after a re-narration
-- narrates again instead of failing the render for good. Safe to re-run.

create or replace function public.video_narration_ready(p_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(v.script, '') = ''
    or (not v.talking and coalesce(v.latest_text, '') = v.script)
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
           )
           -- A continuous take counts only as the newest take of the whole script (above).
           when coalesce(voice.type, '') = 'narration' then true
           else coalesce(voice.meta->>'text', '') <> l.line
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
           ) as latest_text
      from public.marketing_video_scenes as scene
      cross join lateral (
        select public.video_narration_line(scene.meta, scene.voiceover_text) as line
      ) as l
     where scene.item_id = p_item_id
  ) as v;
$$;
