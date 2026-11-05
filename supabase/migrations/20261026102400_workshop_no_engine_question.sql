-- The workshop never asks the user which engine to use: the server picks the best connected
-- engine and Carmen only says which one worked. Safe to re-run.

UPDATE public.ai_skills SET
  system_prompt = system_prompt || E'\n- אל תשאלי את המשתמש באיזה מנוע ליצור (תמונות או וידאו). השרת בוחר לבד את המנוע הטוב ביותר שמחובר, ואת רק אומרת במשפט אחד במה זה נוצר. שאלות שהכלי מחזיר ב-say_to_user נשלחות למשתמש כמו שהן.'
WHERE slug IN ('carmen_workshop', 'workshop_designer', 'workshop_producer', 'workshop_editor')
  AND scope = 'global'
  AND system_prompt NOT LIKE '%אל תשאלי את המשתמש באיזה מנוע ליצור%';
