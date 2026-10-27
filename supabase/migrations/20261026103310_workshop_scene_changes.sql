-- Workshop (AIO-270): change one scene on request, talking scenes from the user's own pictures,
-- and a script shown for approval before the film is produced. Safe to re-run.
--
-- workshop_update_scene (_shared/workshop/tools/update-scene.ts) changes one scene of the open
-- film: the one the user selected on the board (the workshop context names its scene_id) or
-- named ("סצנה 3"). The producer and the video editor may call it (roles.ts ROLE_TOOLS); the
-- skins list it so a skin-matched run offers it too. Guidance added to the skins:
--   * a selected scene: change only that scene, with workshop_update_scene;
--   * a talking scene from the user's materials: workshop_edit_from_assets with lipsync and
--     dialogue, spoken in the project's chosen voice over the user's own picture;
--   * a script the user asked to approve: shown, and nothing paid runs until the user approves.

UPDATE public.ai_skills SET
  allowed_tools = array_append(allowed_tools, 'workshop_update_scene')
WHERE slug IN ('carmen_workshop', 'workshop_producer', 'workshop_editor')
  AND scope = 'global'
  AND NOT ('workshop_update_scene' = ANY (allowed_tools));

-- Every film skin: one scene at a time, and the script before the production.
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- סצנה שהמשתמש בחר בלוח (scene_id בהקשר הסדנה) או "סצנה N": משנים רק אותה, עם workshop_update_scene, ושולחים רק את מה שמשתנה. לא כותבים סטוריבורד מחדש בשביל שינוי בסצנה אחת, ולא מפיקים מחדש בלי שהמשתמש ביקש. אחרי השינוי: משפט אחד מה השתנה, ושאלה אם להרכיב את הסרט מחדש.'
    || E'\n- המשתמש ביקש לאשר את התסריט או את מה שהדמות אומרת לפני ההפקה: הציגי אותו סצנה אחרי סצנה (מה רואים, מה הדמות עושה, מה היא אומרת והכיתוב על המסך), ועצרי. תמונות והפקה בתשלום רק אחרי שהמשתמש אישר בהודעה שלו. תיקון שלו לסצנה נכנס עם workshop_update_scene.'
WHERE slug IN ('carmen_workshop', 'workshop_producer', 'workshop_editor')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%workshop_update_scene%';

-- The video editor (and the shared workshop skin, which also edits from materials): a picture of
-- the user's that talks.
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- סצנה מדברת מהחומרים (למשל כל סקין מציגה את עצמה): ב-workshop_edit_from_assets מעבירים לסצנה lipsync=true, dialogue עם המשפט שלה בעברית, speaker באנגלית, ותנועה אחרת לכל סקין ב-motion. הדמות שבתמונה של המשתמש עצמה אומרת את המשפט בליפ סינק, בקול שנבחר לפרויקט: לפני ההפקה workshop_choose_voice אם עוד לא נבחר קול. התמונות הן תמיד התמונות האמיתיות שהמשתמש העלה, אף פעם לא תמונות שהמצאת.'
WHERE slug IN ('carmen_workshop', 'workshop_editor')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%lipsync=true, dialogue%';

-- The producer: a storyboard character that talks says its own line.
UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- דמות שמדברת למצלמה בסטוריבורד: lipsync=true, dialogue עם המשפט שלה בעברית ו-speaker באנגלית. סרט מהתמונות האמיתיות שהמשתמש העלה (למשל הסקינים): אמרי שעורכת הווידאו לוקחת את זה (workshop_edit_from_assets).'
WHERE slug = 'workshop_producer'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%lipsync=true, dialogue%';
