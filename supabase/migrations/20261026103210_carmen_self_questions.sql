-- AIO-244: a question about Carmen herself (her skins and their images, her abilities, the
-- system) gets a direct answer, not a new workshop project or studio action. Only a new work
-- request starts a workshop project. Safe to re-run.

UPDATE public.ai_skills SET
  system_prompt = replace(
    system_prompt,
    '- בקשה חדשה בלי פרויקט בהקשר: workshop_start_project מיד',
    '- בקשת עבודה חדשה (מודעה, סרטון, קופי...) בלי פרויקט בהקשר: workshop_start_project מיד'
  )
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt LIKE '%- בקשה חדשה בלי פרויקט בהקשר: workshop_start_project מיד%';

UPDATE public.ai_skills SET
  system_prompt = system_prompt || E'\n- שאלה עלייך (הסקינים שלך והתמונות שלהם, מה את יודעת לעשות, לאילו כלים יש לך גישה) או על המערכת היא לא בקשת עבודה: עני ישירות ובאמת, בלי פרויקט, בלי workshop_start_project ובלי שאלות בריף. סקינים ותמונות: get_carmen_skins, וכל דיוקן כתמונת Markdown.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%שאלה עלייך (הסקינים שלך%';

UPDATE public.ai_skills SET
  system_prompt = system_prompt || E'\n- שאלה עלייך או על המערכת היא לא פעולת סטודיו: עני ישירות, בלי get_studio_state.'
WHERE slug = 'creative_studio'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%שאלה עלייך או על המערכת היא לא פעולת סטודיו%';
