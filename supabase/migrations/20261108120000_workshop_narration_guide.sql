-- The narration in the user's own voice (Carmen Workshop): explaining word by word how a line
-- should sound is too hard, so the user records the narration on the board and Carmen keeps its
-- delivery and changes only the voice to the project's narrator (ElevenLabs speech to speech in
-- the render worker, src/jobs/guide-take.ts). The take goes through the same review question.
-- Safe to re-run.
--
-- 1. queue_narration_guide: queues the continuous voice run with the recording (input.guide_audio).
-- 2. workshop_narration_take: a take made from a recording used no pronunciations (the user's own
--    reading says each word), so a pronunciation saved after it does not mark it changed; the
--    answer says whether the take came from a recording (guide). Copied from
--    20261107120000_workshop_narration_review.sql, changes marked "guide".
-- 3. Carmen's guidance mentions the option.

-- ── 1. queue_narration_guide ────────────────────────────────────────────────
-- Queues the film's narration as one continuous voice run that voices the user's recording
-- (p_guide: {bucket, path}) again in p_voice_id. The recording must be in the project's own
-- narration folder in creative-video (<tenant>/<client>/<item>/narration/guide-<ms>.<ext>, as
-- narration-guide.ts isGuidePathOf checks it); a talking film (narrated scene by scene) and a film
-- with no narration queue nothing, nor does one whose narration is already being recorded. The
-- run reads the same script as queue_video_sound's continuous run, so video_narration_ready
-- counts its take the same way. Runs as the caller, so the caller's RLS decides what exists.
create or replace function public.queue_narration_guide(
  p_item_id uuid,
  p_guide jsonb,
  p_voice_id text,
  p_estimate jsonb default '{}'::jsonb,
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
  v_ids uuid[];
  v_script text;
  v_path text := coalesce(p_guide->>'path', '');
  v_voice_id text := nullif(btrim(coalesce(p_voice_id, '')), '');
begin
  select * into v_item from public.marketing_work_items where id = p_item_id;
  if not found then
    raise exception 'queue_narration_guide: work item % not found', p_item_id using errcode = 'P0002';
  end if;
  if coalesce(p_guide->>'bucket', '') <> 'creative-video'
     or v_path !~ ('^' || v_item.tenant_id::text || '/[A-Za-z0-9_-]{1,80}/' || p_item_id::text
                   || '/narration/guide-[0-9]+\.(webm|mp4|m4a|ogg|wav|mp3)$') then
    raise exception 'queue_narration_guide: the recording is not in this project''s narration folder'
      using errcode = '22023';
  end if;
  if v_voice_id is null then
    raise exception 'queue_narration_guide: a voice is required' using errcode = '22023';
  end if;
  v_stage := coalesce(p_stage_id, v_item.current_stage_id);
  if v_stage is null then
    raise exception 'queue_narration_guide: work item % has no stage', p_item_id using errcode = '22023';
  end if;
  if public.video_film_talks(p_item_id) then
    raise notice 'queue_narration_guide: % talks, each scene is voiced on its own', p_item_id;
    return;
  end if;

  select coalesce(array_agg(n.scene_id order by n.scene_position), '{}'::uuid[]),
         string_agg(n.line, ' ' order by n.scene_position)
    into v_ids, v_script
    from public.video_narrated_scenes(p_item_id) as n;
  if coalesce(v_script, '') = '' then
    raise notice 'queue_narration_guide: % has no narration', p_item_id;
    return;
  end if;

  -- One continuous voice run at a time (marketing_runs_one_active_narration).
  begin
    return query
    insert into public.marketing_runs (tenant_id, item_id, stage_id, kind, status, provider, input)
    values (
      v_item.tenant_id,
      p_item_id,
      v_stage,
      'voice',
      'queued',
      'elevenlabs',
      jsonb_build_object(
        'continuous', true,
        'scene_ids', to_jsonb(v_ids),
        'client_id', v_item.client_id,
        'voiceover_text', v_script,
        'voice_id', v_voice_id,
        'guide_audio', jsonb_build_object('bucket', 'creative-video', 'path', v_path),
        'estimate', public.video_run_estimate(coalesce(p_estimate, '{}'::jsonb), 1)
      )
    )
    returning *;
  exception when unique_violation then
    raise notice 'queue_narration_guide: % already records its narration', p_item_id;
    return;
  end;
end;
$$;

revoke all on function public.queue_narration_guide(uuid, jsonb, text, jsonb, uuid) from public, anon;
grant execute on function public.queue_narration_guide(uuid, jsonb, text, jsonb, uuid) to authenticated, service_role;

-- ── 2. workshop_narration_take ──────────────────────────────────────────────
-- The project's narration as the review sees it, or null for an unknown project (see
-- 20261107120000_workshop_narration_review.sql for every key). guide: the newest take voices the
-- user's recording (meta.source = 'guide'); such a take never reads pronunciations, so
-- pronunciations_changed is false for it.
-- Runs as the caller, so the caller's RLS decides what exists.
create or replace function public.workshop_narration_take(p_item_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with item as (
    select work.id, work.tenant_id
      from public.marketing_work_items as work
     where work.id = p_item_id
  ),
  entry as (
    -- The tenant's usable pronunciations by key, the newest when two terms share a key.
    select distinct on (plain.term) plain.term,
           normalize(btrim(dict.spoken), nfc) as spoken,
           dict.updated_at
      from public.carmen_pronunciations as dict
      join item on item.tenant_id = dict.tenant_id
     cross join lateral (
       select lower(regexp_replace(
                regexp_replace(normalize(dict.term, nfc), '[֑-ׇֽֿׁׂׅׄ]', '', 'g'),
                '^[^[:alnum:]א-ת֑-ׇ׳'']+|[^[:alnum:]א-ת֑-ׇ׳'']+$', '', 'g')) as term
     ) as plain
     where plain.term <> ''
       and plain.term !~ '\s'
       and btrim(dict.spoken) <> ''
       and btrim(dict.spoken) !~ '\s'
     order by plain.term, dict.updated_at desc
  ),
  take as (
    select asset.id, asset.run_id,
           -- When the take's voice run started (the worker reads the pronunciations then), not
           -- when its file was saved.
           coalesce(run.started_at, run.created_at, asset.created_at) as made_at,
           -- The script it read, without nikud and in lower case, as the entries are keyed.
           lower(regexp_replace(coalesce(asset.meta->>'text', ''), '[֑-ׇֽֿׁׂׅׄ]', '', 'g')) as script,
           case when jsonb_typeof(asset.meta->'pronunciations') = 'object'
             then asset.meta->'pronunciations' else '{}'::jsonb end as used,
           -- guide: voiced from the user's recording.
           coalesce(asset.meta->>'source', '') = 'guide' as guide
      from public.marketing_assets as asset
      join item on item.id = asset.item_id and item.tenant_id = asset.tenant_id
      left join public.marketing_runs as run
        on run.id = asset.run_id and run.tenant_id = asset.tenant_id
     where asset.type = 'narration' and asset.url is not null
     order by asset.created_at desc
     limit 1
  ),
  last_run as (
    select run.id, run.status, run.error, run.created_at
      from public.marketing_runs as run
      join item on item.id = run.item_id and item.tenant_id = run.tenant_id
     where run.kind = 'voice' and run.scene_id is null
     order by run.created_at desc
     limit 1
  )
  select jsonb_build_object(
    'ready', public.video_narration_ready(item.id),
    'talking', public.video_film_talks(item.id),
    'run_id', (select take.run_id from take),
    'asset_id', (select take.id from take),
    'guide', coalesce((select take.guide from take), false),
    'pronunciations_changed', coalesce((
      select exists (
               select 1 from entry
                where (entry.updated_at > take.made_at
                        and take.script ~ (
                          -- Space or start, edge punctuation, up to two prefix letters, the term
                          -- (every other character escaped), edge punctuation, space or end.
                          '(^|\s)[^[:alnum:]א-ת֑-ׇ׳'']*[ובכלמשה]{0,2}'
                          || regexp_replace(entry.term, '([^[:alnum:]א-ת])', '\\\1', 'g')
                          || '[^[:alnum:]א-ת֑-ׇ׳'']*(\s|$)'
                        )
                        and (take.used->>entry.term) is distinct from entry.spoken)
                   or (take.used ? entry.term and take.used->>entry.term <> entry.spoken)
             )
             or exists (
               select 1 from jsonb_object_keys(take.used) as used_term
                where not exists (select 1 from entry where entry.term = used_term)
             )
        from take
       -- guide: the user's reading says each word; no pronunciation applies to it.
       where not take.guide
    ), false),
    'last_run_id', (select last_run.id from last_run),
    'last_run_status', (select last_run.status from last_run),
    'last_run_error', (select last_run.error from last_run),
    'pronunciations_since_last_run', coalesce((
      select exists (select 1 from entry where entry.updated_at > last_run.created_at)
        from last_run
    ), false)
  )
  from item;
$$;

revoke all on function public.workshop_narration_take(uuid) from public, anon;
grant execute on function public.workshop_narration_take(uuid) to authenticated, service_role;

-- ── 3. Carmen's guidance ────────────────────────────────────────────────────
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n  • המשתמש מקליט את הקריינות בקול שלו (כפתור "הקלטה בקול שלי" בעמוד "קריינות"): ההודעה שלו מתחילה ב"הקלטתי את הקריינות בקול שלי:" ואחריה נתיב הקובץ. קראי ל-workshop_produce_video (השרת קורא את הנתיב מההודעה; אפשר גם guide_recording עם הנתיב). כרמן שומרת את הקצב, האינטונציה וההגייה של ההקלטה ומחליפה רק את הקול לקול שנבחר לפרויקט; התוצאה מוצגת שוב לאישור באותה שאלה. כשקשה להסביר במילים מה לא נשמע נכון, הציעי את האפשרות הזאת.'
WHERE slug IN ('carmen_workshop', 'workshop_producer')
  AND scope = 'global'
  AND system_prompt LIKE '%בדיקת קריינות (מצב חצי אוטומטי)%'
  AND system_prompt NOT LIKE '%הקלטה בקול שלי%';
