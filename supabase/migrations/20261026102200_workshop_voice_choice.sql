-- The producer and the video editor let the user hear and choose the narration voice
-- (workshop_choose_voice) before a film is narrated. Safe to re-run.

UPDATE public.ai_skills SET
  allowed_tools = array_append(allowed_tools, 'workshop_choose_voice'),
  system_prompt = system_prompt || E'\n- קריינות: לפני שהסרט מוקרן, המשתמש בוחר קול אחרי שהאזין. workshop_choose_voice מניח בלוח דוגמה לכל קול עברי ומחזיר say_to_user עם כפתורים: שלחי אותו כמו שהוא ועצרי, ואחרי הבחירה קראי שוב עם voice. הקול נשמר לפרויקט.'
WHERE slug IN ('workshop_producer', 'workshop_editor', 'carmen_workshop')
  AND scope = 'global'
  AND NOT ('workshop_choose_voice' = ANY (allowed_tools));
