-- The workshop's narration review (semi-automatic mode): Carmen voices the narration alone, the
-- user listens on the board and approves it or corrects how words are said, before any clip is
-- paid for. Replaces the content of 20261105170000_workshop_narration_review (now a stub). Safe to
-- re-run.
--
-- Pronunciations live in Carmen's one dictionary, carmen_pronunciations (20261105210000, AIO-414):
-- a correction made in a live voice call or in the workshop (workshop_save_pronunciation, keyed
-- (tenant_id, term_key) like the live voice's save_pronunciation) applies to both. The live voice
-- hands every entry to the voice model as an instruction; film narration (render-worker
-- jobs/pronunciations.ts) replaces words in the text the voice engine hears, so it uses only an
-- entry whose term and spoken form are one word each, matched whole (case-insensitively, as
-- term_key), also after up to two Hebrew prefix letters.
-- workshop_narration_take: what the edge's narration review needs to know about a project's
--   narration in one read: the newest continuous take, whether it reads the current script in the
--   project's voice, whether a pronunciation changed since it was made, and the latest voice run.

-- ── 1. The superseded table ─────────────────────────────────────────────────
-- Only the PR's Preview branch ever had it (from 20261105170000 before it became a stub); it held
-- test data only, and carmen_pronunciations replaces it.
drop table if exists public.workshop_pronunciations;

-- ── 2. workshop_narration_take ──────────────────────────────────────────────
-- The project's narration as the review sees it, or null for an unknown project: ready
-- (video_narration_ready), talking (video_film_talks), the newest continuous take (its run and
-- asset), whether a tenant pronunciation changed since that take (an entry for a word in its
-- script saved after its voice run started and not used by it as it is now, or an entry it used
-- that changed or is gone), the newest continuous voice run, and whether a pronunciation was saved
-- after that run was queued (so a failed run is not the current recording any more).
-- An entry is keyed and filtered as the render worker loads it (pronunciations.ts
-- loadPronunciations): its term NFC, lower case, without nikud or edge punctuation, and skipped
-- when the term or the spoken form is more than one word. A script word matches an entry as the
-- worker matches it (sayWord): the whole word between spaces and edge punctuation, after up to two
-- of the prefix letters ו ה ב כ ל מ ש. Change together: render-worker/src/jobs/pronunciations.ts
-- (plainWord, PREFIXES, EDGE) and supabase/functions/_shared/workshop/tools/save-pronunciation.ts
-- (plainWord).
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
                regexp_replace(normalize(dict.term, nfc), '[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]', '', 'g'),
                '^[^[:alnum:]\u05D0-\u05EA\u0591-\u05C7\u05F3'']+|[^[:alnum:]\u05D0-\u05EA\u0591-\u05C7\u05F3'']+$', '', 'g')) as term
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
           lower(regexp_replace(coalesce(asset.meta->>'text', ''), '[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]', '', 'g')) as script,
           case when jsonb_typeof(asset.meta->'pronunciations') = 'object'
             then asset.meta->'pronunciations' else '{}'::jsonb end as used
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
    'pronunciations_changed', coalesce((
      select exists (
               select 1 from entry
                where (entry.updated_at > take.made_at
                        and take.script ~ (
                          -- Space or start, edge punctuation, up to two prefix letters, the term
                          -- (every other character escaped), edge punctuation, space or end.
                          '(^|\s)[^[:alnum:]\u05D0-\u05EA\u0591-\u05C7\u05F3'']*[ובכלמשה]{0,2}'
                          || regexp_replace(entry.term, '([^[:alnum:]\u05D0-\u05EA])', '\\\1', 'g')
                          || '[^[:alnum:]\u05D0-\u05EA\u0591-\u05C7\u05F3'']*(\s|$)'
                        )
                        and (take.used->>entry.term) is distinct from entry.spoken)
                   or (take.used ? entry.term and take.used->>entry.term <> entry.spoken)
             )
             or exists (
               select 1 from jsonb_object_keys(take.used) as used_term
                where not exists (select 1 from entry where entry.term = used_term)
             )
        from take
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
-- The Preview branch already has the 20261105170000 wording: its pronunciation line becomes the
-- one-dictionary wording (no-op where it is absent).
UPDATE public.ai_skills SET
  system_prompt = replace(system_prompt,
    'המשתמש אומר שמילה נשמעת לא נכון (״מכירות נשמע מחירות״): שמרי את ההגייה ב-workshop_save_pronunciation: word כפי שכתובה בתסריט, spoken מילה אחת בניקוד מלא (מְכִירוֹת) או בכתיב שנשמע נכון. ההגייה נשמרת לכל הסדנה ולכל הסרטים הבאים: אמרי למשתמש שזה ייזכר בכל הפרויקטים.',
    'המשתמש אומר שמילה נשמעת לא נכון (״מכירות נשמע מחירות״): שמרי את ההגייה ב-workshop_save_pronunciation: word כפי שכתובה בתסריט, spoken מילה אחת בניקוד מלא (מְכִירוֹת) או בכתיב שנשמע נכון. ההגייה נשמרת במילון ההגייה של כרמן, אותו מילון של השיחה הקולית החיה: היא חלה גם על הקול שלך בשיחות וגם על הקריינות בכל הסרטים והפרויקטים הבאים. אמרי זאת למשתמש.')
WHERE slug IN ('carmen_workshop', 'workshop_producer')
  AND scope = 'global'
  AND system_prompt LIKE '%המשתמש אומר שמילה נשמעת לא נכון (״מכירות נשמע מחירות״): שמרי את ההגייה ב-workshop_save_pronunciation: word כפי שכתובה בתסריט, spoken מילה אחת בניקוד מלא (מְכִירוֹת) או בכתיב שנשמע נכון. ההגייה נשמרת לכל הסדנה ולכל הסרטים הבאים: אמרי למשתמש שזה ייזכר בכל הפרויקטים.%';

UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- בדיקת קריינות (מצב חצי אוטומטי): אחרי שהקול נבחר, workshop_produce_video מקליט קודם רק את הקריינות (עולה סנטים, מתוך התקציב של הסרט), היא מופיעה בלוח בעמוד "קריינות", והמשתמש מאשר בכפתור "הקריינות מאושרת" לפני שמשהו מונפש. אין הפקה עד שאישר את הקריינות שהוצגה לו. ההקלטה שאושרה היא זו שנכנסת לסרט, בלי לשלם עליה שוב.'
    || E'\n  • המשתמש אומר שמילה נשמעת לא נכון (״מכירות נשמע מחירות״): שמרי את ההגייה ב-workshop_save_pronunciation: word כפי שכתובה בתסריט, spoken מילה אחת בניקוד מלא (מְכִירוֹת) או בכתיב שנשמע נכון. ההגייה נשמרת במילון ההגייה של כרמן, אותו מילון של השיחה הקולית החיה: היא חלה גם על הקול שלך בשיחות וגם על הקריינות בכל הסרטים והפרויקטים הבאים. אמרי זאת למשתמש. אחר כך קראי שוב ל-workshop_produce_video: הקריינות מוקלטת מחדש ומוצגת שוב לאישור.'
    || E'\n  • ביקש הקלטה חדשה בלי מילה מסוימת (נשמע לא טבעי): workshop_produce_video עם redo_narration=true. ביקש קול אחר: workshop_choose_voice. ביקש לשנות טקסט: תקני את הסצנה (workshop_update_scene); הקריינות תוקלט מחדש.'
    || E'\n  • מצב אוטומטי: אין שלב בדיקה; ההגיות השמורות חלות גם שם.'
WHERE slug IN ('carmen_workshop', 'workshop_producer')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%בדיקת קריינות (מצב חצי אוטומטי)%';
