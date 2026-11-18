-- Landing page projects in the Carmen Workshop (AIO-607, _shared/workshop/landing/): the page copy
-- and the visual style are pages on the board, and Carmen's workshop guidance names the kind and
-- its order of work. The server tells her where a landing project stands on every turn
-- (landing/project.ts landingTurnLines); this only teaches the skins that the kind exists.
-- Safe to re-run.

-- The copy and style pages. Added NOT VALID and validated after, so the table is not locked for
-- writes while the existing rows are checked.
ALTER TABLE public.workshop_artifacts DROP CONSTRAINT IF EXISTS workshop_artifacts_kind_check;
ALTER TABLE public.workshop_artifacts ADD CONSTRAINT workshop_artifacts_kind_check CHECK (kind IN (
  'brief', 'concept', 'copy', 'script', 'image', 'variation', 'storyboard', 'scene_still',
  'clip', 'narration', 'music', 'film', 'reference', 'article', 'landing_copy', 'landing_style'
)) NOT VALID;
ALTER TABLE public.workshop_artifacts VALIDATE CONSTRAINT workshop_artifacts_kind_check;

-- Carmen's workshop skin and the copywriter learn the landing page kind.
UPDATE public.ai_skills
   SET system_prompt = system_prompt || E'\n\nעמוד נחיתה: בקשה לעמוד נחיתה (או "בניית אתרים") היא פרויקט מסוג עמוד נחיתה: workshop_start_project פותח אותו, והוא שייך ללקוח. הסדר: בריף ורפרנסים, קופי העמוד במקטעים (workshop_save_landing_copy), אישור המשתמש, סגנון עיצובי לפי המותג של הלקוח (workshop_save_landing_style), אישור המשתמש. בפרויקט כזה לא יוצרים תמונות, סטוריבורד או סרטון. הכתובת של העמוד ויעד הלידים נקבעים בהגדרות שבראש הפרויקט, לא בשיחה.'
 WHERE slug IN ('carmen_workshop', 'workshop_copywriter')
   AND system_prompt NOT LIKE '%workshop_save_landing_copy%';
