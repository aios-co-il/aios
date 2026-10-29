-- Workshop video: scene stills, clips, narration, music and the final film appear on the board
-- as the worker and the studio RPCs create them, and Carmen's workshop skin gets the full tool set.

-- ── marketing_assets -> workshop_artifacts mirror ────────────────────────────
-- Only for projects Carmen started in the workshop (payload.workshop). Never blocks the asset insert.
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

  select payload into v_payload from public.marketing_work_items where id = new.item_id;
  if v_payload is null or not (v_payload ? 'workshop') then
    return new;
  end if;

  if exists (
    select 1 from public.workshop_artifacts
     where ref_table = 'marketing_assets' and ref_id = new.id
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
     where id = (new.meta ->> 'scene_id')::uuid;
    if found then
      v_title := (case v_kind when 'clip' then 'הנפשה · סצנה ' else 'סצנה ' end)
        || trim(to_char(v_scene.position, 'FM999990.##'), '.')
        || case when coalesce(v_scene.title, '') <> '' then ' · ' || v_scene.title else '' end;
    end if;
  end if;
  if v_title = '' then
    v_title := case v_kind when 'clip' then 'הנפשה' else 'תמונת סצנה' end;
  end if;

  if v_kind = 'film' then
    select id into v_pending
      from public.workshop_artifacts
     where item_id = new.item_id and kind = 'film' and status = 'pending'
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
  );
  return new;
exception when others then
  raise warning 'workshop_mirror_asset: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists workshop_mirror_asset on public.marketing_assets;
create trigger workshop_mirror_asset
  after insert on public.marketing_assets
  for each row execute function public.workshop_mirror_asset();

-- ── A failed render run closes the pending film page ─────────────────────────
create or replace function public.workshop_fail_pending_film()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'render' and new.status = 'failed' and old.status is distinct from 'failed' then
    update public.workshop_artifacts
       set status = 'failed',
           meta = meta || jsonb_build_object('error', coalesce(new.error, 'ההרכבה נכשלה'))
     where id = (
       select id from public.workshop_artifacts
        where item_id = new.item_id and kind = 'film' and status = 'pending'
        order by created_at desc
        limit 1
     );
  end if;
  return new;
exception when others then
  raise warning 'workshop_fail_pending_film: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists workshop_fail_pending_film on public.marketing_runs;
create trigger workshop_fail_pending_film
  after update of status on public.marketing_runs
  for each row execute function public.workshop_fail_pending_film();

-- ── Carmen workshop skin: concepts, copy, storyboard, stills and film production ──
UPDATE public.ai_skills
SET
  description = 'כרמן בסדנה: מקבלת בקשה בשפה חופשית ומפיקה ממנה פרויקט שיווק (מודעה, קמפיין, סרטון) בלי שהמשתמש ממלא הגדרות.',
  system_prompt = $$את כרמן, מנהלת השיווק הדיגיטלי, בסדנה שלך. המשתמש רואה לוח עם כל מה שאת מפיקה, ואת עובדת לצדו.
איך עובדים:
- כשהמשתמש מבקש משהו חדש ואין פרויקט בהקשר: workshop_start_project מיד, עם הבקשה במילותיו. אל תשאלי על סוג, גודל, סגנון או אורך. הכלי מחליט, ואת מספרת במשפט אחד מה הוחלט ("סרטון אנכי של 15 שניות, 5 סצנות").
- יש פרויקט בהקשר: workshop_get_state לפני שמוסיפים עליו.
- קונספטים: מציעים שלושה כיוונים שונים עם workshop_save_concepts. קופי (כותרות, טקסט, קריאה לפעולה): workshop_save_copy. כל אחד נשמר ללוח, ואין בהם עלות.
- תמונות למודעה או לפוסט: workshop_make_creative. הוא עולה כסף. קראי קודם עם confirmed=false, הציגי למשתמש את העלות במשפט אחד וחכי ל"כן" או "אשר". רק אחרי שהוא אישר בהודעה שלו, קראי עם confirmed=true. אישור אחד מכסה את כל ההפקה, אל תשאלי שוב על כל תמונה.
- התיאור לתמונה (prompt) בכתיבה שלך, באנגלית, מפורט: נושא, סגנון, תאורה, קומפוזיציה, בלי טקסט על התמונה.
- סרטון: קודם workshop_storyboard (כתיבת הסצנות, בלי עלות), אחר כך workshop_make_stills (תמונה לכל סצנה, עולה כסף ודורש אישור), ואז workshop_produce_video (הנפשה, קריינות, מוזיקה והרכבה). בכל כלי כזה קראי קודם עם confirmed=false, הציגי את העלות ואת המנוע שנבחר במשפט אחד, וחכי לאישור. אישור אחד מכסה את ההפקה כולה.
- workshop_produce_video יכול להחזיר needs_client: הפרויקט צריך לקוח. שאלי את המשתמש לאיזה לקוח, ואז קראי שוב עם client_id.
- ההפקה רצה ברקע. אחרי workshop_produce_video אמרי שהסרט יופיע בלוח בעוד דקה או שתיים, ואל תחכי ואל תבדקי בלולאה.
- אם כלי מחזיר שגיאה (למשל מפתח OpenAI חסר או מגבלת חיוב), אמרי את הסיבה במילים פשוטות ומה המשתמש יכול לעשות. אל תמציאי תוצאה.
- אם אין מפתחות למנוע וידאו, ההפקה תרוץ במנוע בדיקה: אמרי את זה בפשטות.
- קובץ שהמשתמש העלה מופיע בהודעה עם קישור: החליטי לפי השם וההקשר אם זה לוגו, רפרנס סגנון, ספר מותג או דמות, וצרפי אותו עם attach_to_project.
- עריכת סצנות בסרט קיים: edit_scene, add_scene, delete_scene.
- תשובות קצרות וחמות, בעברית, בלשון נקבה. משפט או שניים ומה הצעד הבא.$$,
  allowed_tools = ARRAY[
    'workshop_start_project', 'workshop_get_state', 'workshop_make_creative',
    'workshop_save_concepts', 'workshop_save_copy', 'workshop_storyboard',
    'workshop_make_stills', 'workshop_produce_video',
    'update_studio_settings', 'attach_to_project', 'edit_scene', 'add_scene', 'delete_scene',
    'get_video_storyboard'
  ]::text[],
  steps = $$1. פרויקט חדש מהבקשה.
2. קונספט וקופי.
3. סטוריבורד ותמונות סצנה.
4. אישור עלות אחד והפקה.$$
WHERE slug = 'carmen_workshop' AND scope = 'global';
