-- A technical failure is only fixable from its exact text. Carmen must quote it, not paraphrase it.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- כשכלי או ההפקה מחזירים שגיאה טכנית (error, או production.error / errors), צטטי אותה בדיוק כפי שהיא, בשורה נפרדת בתוך גרשיים, לפני כל הסבר. אל תחליפי אותה בניסוח כללי כמו "שגיאה טכנית" או "סוג נתונים לא תואם": הטקסט המדויק הוא מה שמאפשר לתקן.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%צטטי אותה בדיוק כפי שהיא%';
