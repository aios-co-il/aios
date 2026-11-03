-- A film's script before its storyboard (_shared/workshop/film-script.ts). After the concept is
-- chosen the copywriter writes a timed script, saved as a 'script' page on the board; the user
-- approves it and the storyboard is built from it. The server routes a film still being written
-- to the copywriter skin (_shared/workshop/roles.ts). Safe to re-run.

-- The script page. Added NOT VALID and validated after, so the table is not locked for writes
-- while the existing rows are checked.
ALTER TABLE public.workshop_artifacts DROP CONSTRAINT IF EXISTS workshop_artifacts_kind_check;
ALTER TABLE public.workshop_artifacts ADD CONSTRAINT workshop_artifacts_kind_check CHECK (kind IN (
  'brief', 'concept', 'copy', 'script', 'image', 'variation', 'storyboard', 'scene_still',
  'clip', 'narration', 'music', 'film', 'reference', 'article'
)) NOT VALID;
ALTER TABLE public.workshop_artifacts VALIDATE CONSTRAINT workshop_artifacts_kind_check;

-- The copywriter specialist.
INSERT INTO public.ai_skills
  (slug, scope, name, description, goal, constraints, system_prompt, allowed_tools, triggers, handoff_slugs, is_active, steps, created_by_agent)
SELECT 'workshop_copywriter', 'global', 'קופירייטרית', '', '', '', '', ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], true, '', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_skills s WHERE s.slug = 'workshop_copywriter' AND s.scope = 'global'
);

UPDATE public.ai_skills SET
  name = 'קופירייטרית',
  description = 'הקופירייטרית של הסדנה: הקונספטים והתסריט של סרט, עד שהמשתמש מאשר את התסריט.',
  goal = 'תסריט חזק ומדויק באורך הסרט, שהמשתמש מאשר לפני שכותבים סצנות.',
  constraints = 'לא כותבים סצנות לפני שהתסריט אושר. לא עולה כסף.',
  system_prompt = $$את הקופירייטרית של הסדנה: כותבת את הקונספטים ואת התסריט של סרט, עד שהמשתמש מאשר את התסריט.
- הסדר: בריף, 2 עד 3 קונספטים (workshop_save_concepts), בחירת קונספט, תסריט (workshop_save_script), אישור התסריט, ואז הסטוריבורד מהתסריט (workshop_storyboard). אחרי זה המפיקה ממשיכה לתמונות ולהפקה.
- workshop_storyboard מחזיר needs_input עם השלב שחסר: עשי בדיוק מה שכתוב ב-carmen_next.
- תסריט: לכל שורה זמן, קריינות, טקסט קצר על המסך ומה רואים, לפי הקונספט שנבחר ובאורך המדויק של הסרט. כללי הכתיבה בתיאור של workshop_save_script.
- workshop_save_script מציג למשתמש את התסריט עם כפתורי אישור: עצרי אחריו. בקשת שינוי: כתבי מחדש ושמרי שוב. אישור במילים: workshop_storyboard עם script_approved=true.
- הסטוריבורד אחרי האישור: סצנה אחת לכל שורה בתסריט, והקריינות והטקסט על המסך כמו שאושרו.
- פנייה למשתמש בלשון ניטרלית ("אפשר לבחור"), לא "תבחרי" או "תבחר".$$,
  allowed_tools = ARRAY[
    'workshop_start_project', 'workshop_get_state', 'workshop_check_connections',
    'workshop_inspect_site', 'workshop_add_assets', 'workshop_assign_client',
    'workshop_save_concepts', 'workshop_save_copy', 'workshop_save_script',
    'workshop_storyboard'
  ]::text[],
  handoff_slugs = ARRAY['workshop_producer', 'workshop_designer', 'workshop_editor']::text[],
  steps = $$1. קונספטים ובחירה.
2. תסריט באורך הסרט.
3. אישור התסריט.
4. סטוריבורד מהתסריט.$$
WHERE slug = 'workshop_copywriter' AND scope = 'global';

-- The shared workshop skin and the producer save scripts too, and know the order.
UPDATE public.ai_skills SET
  allowed_tools = array_append(allowed_tools, 'workshop_save_script')
WHERE slug IN ('carmen_workshop', 'workshop_producer')
  AND scope = 'global'
  AND NOT ('workshop_save_script' = ANY (allowed_tools));

UPDATE public.ai_skills SET
  handoff_slugs = array_append(handoff_slugs, 'workshop_copywriter')
WHERE slug IN ('carmen_workshop', 'workshop_producer', 'workshop_designer', 'workshop_editor')
  AND scope = 'global'
  AND NOT ('workshop_copywriter' = ANY (handoff_slugs));

UPDATE public.ai_skills SET
  system_prompt = system_prompt
    || E'\n- תסריט לפני סטוריבורד: אחרי בחירת הקונספט כותבים תסריט (workshop_save_script) והמשתמש מאשר אותו. הסטוריבורד נבנה מהתסריט שאושר: סצנה אחת לכל שורה, והקריינות והטקסט על המסך כמו שאושרו.'
WHERE slug IN ('carmen_workshop', 'workshop_producer')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%workshop_save_script%';
