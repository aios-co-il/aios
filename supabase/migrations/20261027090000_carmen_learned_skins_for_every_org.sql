-- Carmen's learned conduct for every org's Carmen (AIO-262).
--
-- Coding agents taught Carmen these rules as MarketingCaptain tenant skins.
-- The skill registry (_shared/skills/registry.ts) loads global skins plus the
-- agent's own tenant, so no other org's Carmen had them. Each slug below gets a
-- global row, written here without any org's people, phones, clients or dev
-- tools.
-- MarketingCaptain's tenant rows are left as they are and still win for its
-- Carmen. A slug that already has a global row keeps it (NOTICE).
-- A global row reaches every tenant's agents whose run loads skills, not only
-- Carmen, and a matched diagnose_campaign_pulse_status adds
-- get_latest_campaign_pulse to that agent's tools.
-- identity-guard gets no global row: its text is not in the repo, so writing
-- an org-neutral version waits on reading the Production row (PR body names
-- the follow-up issue).
--
-- Fires ai_skills_search_vector_trg (BEFORE INSERT). Sends no message.
-- Test: supabase/tests/carmen_learned_skins_global.sql.

DO $migration$
DECLARE
  v_slugs text[];
  v_added bigint;
  v_kept text;
  v_overrides text;
BEGIN
  WITH skins (slug, name, description, triggers, steps, system_prompt, constraints, allowed_tools) AS (
    VALUES
      (
        'group_response_only_when_addressed',
        'בקבוצות עונה רק כשפונים אליי',
        'בקבוצת וואטסאפ כרמן עונה רק כשפונים אליה ישירות. כשמדברים עליה בגוף שלישי היא לא עונה.',
        ARRAY[
          'למה לא ענית בקבוצה',
          'למה ענית בקבוצה',
          'מתי את עונה בקבוצה',
          'מדברים עלייך בקבוצה',
          'why did you reply in the group',
          'group reply only when addressed'
        ]::text[],
        $$1. בדקי אם שואלים למה ענית, או למה לא ענית, בקבוצה.
2. הסבירי שבקבוצה את עונה רק לפנייה ישירה אלייך.
3. הציעי לפנות אלייך בשם בתחילת ההודעה.$$,
        $$בקבוצת וואטסאפ המערכת מעבירה אלייך הודעה רק כשפונים אלייך ישירות: בקשה ("כרמן תבדקי…"), שאלה אלייך ("כרמן, מה המצב?") או פנייה בשם בתחילת ההודעה.
כשמדברים עלייך בגוף שלישי ("כרמן אמורה…", "למה כרמן שלחה…") ההודעה לא מגיעה אלייך. כשלא ברור אם פנו אלייך, את לא עונה.
כששואלים למה ענית או לא ענית בקבוצה, הסבירי את הכלל הזה.$$,
        'אל תבטיחי לענות בקבוצה להודעות שלא פונות אלייך ישירות.',
        '{}'::text[]
      ),
      (
        'wa_notify_never_group_session',
        'עדכונים ודופק רק בפרטי, לא בקבוצה',
        'בדיקת דופק, בדיקת תקינות ועדכון על משימת פיתוח נשלחים תמיד לצ׳אט הפרטי של הנמען. סשן קבוצה פעיל לא משנה את היעד.',
        ARRAY[
          'שלחה עדכון בקבוצה במקום בפרטי',
          'עדכון בקבוצה במקום בפרטי',
          'בדיקת דופק בקבוצה',
          'סשן קבוצה מול פרטי',
          'בלבול בין סשנים',
          'notify went to group',
          'pulse in group instead of private'
        ]::text[],
        $$1. סשן וואטסאפ מזוהה לפי chat_id: צ׳אט פרטי מסתיים ב-@c.us וקבוצה ב-@g.us. שני סשנים פעילים במקביל זה תקין.
2. בסשן של קבוצה, שדה phone הוא הדובר האחרון. הוא לא קובע לאן נשלח עדכון.
3. בדיקת דופק, בדיקת תקינות ועדכון על משימת פיתוח נשלחים תמיד לצ׳אט פרטי.
4. תשובה לשאלה שנשאלה בקבוצה נשארת בקבוצה. זו לא הודעת מערכת.
5. עדכון מערכת שהגיע לקבוצה הוא תקלת ניתוב.$$,
        $$כשאומרים לך שעדכון או בדיקת דופק נשלחו לקבוצה במקום לצ׳אט פרטי:
1. זה בלבול סשנים: סשן הקבוצה היה חדש יותר, והדובר האחרון בו היה הנמען.
2. עדכוני מערכת הולכים לצ׳אט הפרטי של הנמען, או למספר שלו כשאין איתו סשן פרטי.
3. השאירי את סשן הקבוצה פתוח. הקבוצה צריכה להמשיך לקבל תשובות כשפונים אלייך שם.
4. אל תשלחי שוב את אותו עדכון לקבוצה.$$,
        'לא לשלוח עדכון מערכת או בדיקת דופק לקבוצה. לא להרחיב גישה.',
        '{}'::text[]
      ),
      (
        'carmen_session_keyed_by_chat_id',
        'כל קבוצה וכל צ׳אט פרטי הם סשן נפרד לפי chat_id',
        'סשן של כרמן מזוהה לפי מזהה השיחה (chat_id) בלבד. הטלפון של הדובר לא קובע לאן לענות. עדכון מערכת נשלח לנמען שהוגדר לו, לא לסשן החדש ביותר.',
        ARRAY[
          'ענתה בקבוצה הלא נכונה',
          'ענית בקבוצה הלא נכונה',
          'סשן טרי יותר',
          'כל קבוצה סשן נפרד',
          'סשן לפי קבוצה',
          'session mix between groups',
          'chat_id session key'
        ]::text[],
        $$1. מפתח הסשן הוא chat_id: צ׳אט פרטי מסתיים ב-@c.us וקבוצה ב-@g.us. סשן אחד לכל שיחה.
2. שדה phone בסשן הוא הדובר האחרון, מידע נלווה בלבד. אל תחפשי סשן לפי phone.
3. תשובה חוזרת לאותו chat_id שממנו הגיעה השאלה, גם כשקבוצה אחרת פעילה יותר.
4. בדיקת דופק, בדיקת תקינות ועדכון על משימת פיתוח הולכים לצ׳אט הפרטי של הנמען שהוגדר להם, אף פעם לא ל-@g.us.
5. כמה קבוצות פעילות במקביל זה תקין ומכוון.$$,
        $$כששואלים למה ענית בקבוצה הלא נכונה, או למה עדכון הגיע לקבוצה במקום לצ׳אט פרטי:
1. זו תקלת ניתוב: השיחה נבחרה לפי last_message_at או phone במקום לפי chat_id.
2. כל קבוצה היא סשן משלה. שאלה בקבוצה א׳ נענית בקבוצה א׳. עדכון מערכת הולך לנמען שהוגדר לו.
3. השאירי את שאר הסשנים פתוחים. הם צריכים להמשיך לפעול במקביל.$$,
        'לא לנתב לפי הסשן החדש ביותר. לא למזג קבוצות לפי מספר הדובר. לא להרחיב גישה.',
        '{}'::text[]
      ),
      (
        'diagnose_campaign_pulse_status',
        'אבחון בדיקת דופק: אין טבלה מול סנכרון ישן',
        'כשבדיקת הדופק של לקוח נראית ריקה למרות שדוחות מחוברים: להבחין בין no_data (אין טבלת קמפיין מחוברת) לבין סנכרון ישן, ולהציג את המדדים שיש.',
        ARRAY[
          'אין נתונים בדופק',
          'בדיקת דופק אין נתונים',
          'הדוחות מחוברים אבל אין נתונים',
          'סנכרון ישן',
          'pulse no data',
          'pulse no_data'
        ]::text[],
        $$1. קראי ל-get_latest_campaign_pulse עם client_name של הלקוח.
2. בדקי את status ואת flags של הלקוח.
3. ללקוח איקומרס הציגי רכישות ו-ROAS.$$,
        $$כשאומרים שבדיקת הדופק של לקוח מראה "אין נתונים" למרות שהדוחות מחוברים:
1. status=no_data פירושו שאין ללקוח טבלת קמפיין מחוברת (הדגל "אין טבלת קמפיין מחוברת").
2. status=warning או critical עם דגל שמתחיל ב"סנכרון ישן או חסר" פירושו שהטבלה מחוברת והסנכרון ישן. אמרי שהסנכרון ישן וציני את הפלטפורמה.
3. כש-is_ecommerce=true, הציגי רכישות ו-ROAS (purchases_7d, roas_7d) במקום CPL.$$,
        'כשהטבלה מחוברת והסנכרון ישן, אל תאמרי "אין נתונים". אל תמציאי מדדים שהכלי לא החזיר.',
        ARRAY['get_latest_campaign_pulse']::text[]
      )
  ),
  added AS (
    INSERT INTO public.ai_skills (
      slug, scope, tenant_id, name, description, triggers, steps,
      system_prompt, constraints, allowed_tools, is_active, created_by_agent
    )
    SELECT
      s.slug, 'global', NULL, s.name, s.description, s.triggers, s.steps,
      s.system_prompt, s.constraints, s.allowed_tools, true, false
    FROM skins AS s
    ON CONFLICT (slug) WHERE scope = 'global' DO NOTHING
    RETURNING slug
  )
  -- g reads the table as it was before this statement: only global rows that
  -- already existed, which the insert skipped.
  SELECT
    array_agg(s.slug ORDER BY s.slug),
    count(a.slug),
    string_agg(
      format('%s (%s)', s.slug, CASE WHEN g.is_active THEN 'active' ELSE 'inactive' END),
      ', ' ORDER BY s.slug
    ) FILTER (WHERE g.slug IS NOT NULL)
  INTO v_slugs, v_added, v_kept
  FROM skins AS s
  LEFT JOIN added AS a ON a.slug = s.slug
  LEFT JOIN public.ai_skills AS g ON g.slug = s.slug AND g.scope = 'global';

  RAISE NOTICE 'AIO-262: added % of % global skins', v_added, cardinality(v_slugs);
  IF v_kept IS NOT NULL THEN
    RAISE NOTICE 'AIO-262: kept the existing global row for %', v_kept;
  END IF;

  -- The registry prefers a tenant's own row over the global one.
  SELECT string_agg(
    format('%s/%s', coalesce(t.slug, o.tenant_id::text), o.slug),
    ', ' ORDER BY t.slug, o.slug
  )
  INTO v_overrides
  FROM public.ai_skills AS o
  LEFT JOIN public.tenants AS t ON t.id = o.tenant_id
  WHERE o.scope = 'tenant'
    AND o.is_active
    AND o.slug = ANY (v_slugs);
  IF v_overrides IS NOT NULL THEN
    RAISE NOTICE 'AIO-262: these tenant rows still win over the global row: %', v_overrides;
  END IF;
END
$migration$;
