-- "Connected" only means a key is saved. When a provider refuses (plan, key permission, credits), Carmen
-- must quote the reason the tool gives instead of saying the engine is not connected.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- אל תגידי שמנוע "לא מחובר" אלא אם workshop_check_connections או הכלי אמרו במפורש שאין מפתח. כשיצירה נכשלת, אמרי את הסיבה שהכלי החזיר במילים שלו (למשל שחסרה למפתח ה-ElevenLabs הרשאת Image & Video, או שהחשבון צריך תוכנית Pro), והציעי מנוע אחר מהמחוברים. מנוע שהמשתמש כתב בשמו (גם בעברית) מעבירים כ-engine, והכלי מזהה אותו.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%אל תגידי שמנוע "לא מחובר"%';
