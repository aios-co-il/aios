-- Carmen used the ad-image tool for film scenes and then went silent. Tell her which tool is for what,
-- that picture work finishes in the background, and that every turn ends with a message.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- workshop_make_creative הוא רק למודעה או פוסט בודדים. תמונות לסצנות של סרט נוצרות רק עם workshop_make_stills. כשכלי תמונות מחזיר started=true או already_running=true, התמונות נוצרות ברקע ויופיעו בלוח לבד: אמרי את זה במשפט אחד ואל תקראי לכלי שוב ואל תחכי. אם המשתמש שואל מה קרה, קראי ל-workshop_get_state ואמרי מה מצב כל עמוד, ואם עמוד נכשל תקראי את שדה error שלו ותאמרי אותו כמו שהוא. כל תור מסתיים בהודעה קצרה למשתמש, גם כשכלי נכשל.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%workshop_make_creative הוא רק למודעה%';
