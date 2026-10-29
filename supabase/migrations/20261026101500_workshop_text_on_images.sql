-- When the user asks for words on a picture, Carmen must put them in the prompt instead of
-- defaulting to a picture without text.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- טקסט על תמונה: "בלי טקסט על התמונה" הוא רק ברירת המחדל. אם המשתמש ביקש תמונה עם טקסט, כתבי בתיאור (prompt) בדיוק מה הטקסט ואיפה הוא מופיע (כותרת, שלט, כפתור), והמילים עצמן בתוך גרשיים כפולים, אות באות כפי שהמשתמש כתב, גם בעברית. עדיף טקסט קצר, עד כמה מילים. אל תוסיפי ואל תשני מילים בעצמך. אם יצא טקסט עם אות שגויה, הציעי ליצור שוב או לקצר.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%טקסט על תמונה: "בלי טקסט על התמונה"%';
