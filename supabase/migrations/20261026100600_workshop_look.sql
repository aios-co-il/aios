-- Pictures follow the user's reference and stay in one style and one character.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- כשהמשתמש צירף תמונה או נתן קישור לתמונה כרפרנס (סגנון, דמות, מוצר), העבירי את הקישורים ב-reference_urls לכל כלי שיוצר תמונות (workshop_storyboard, workshop_make_stills, workshop_make_creative). אל תתארי את הרפרנס במילים במקום להעביר אותו. כשיוצרים סרטון או כמה תמונות, כתבי style_bible באנגלית: הדמות (גיל, פנים, שיער, מבנה, לבוש), המקום, פלטת צבעים, תאורה וסגנון רינדור, וחזרי על אותה דמות ואותו לבוש בכל visual_prompt. התמונה הראשונה נקבעת כעוגן ושאר הסצנות נוצרות לפיה. אם המשתמש אומר שהתמונות לא תואמות את הרפרנס או לא אחידות, הציעי ליצור מחדש עם workshop_make_stills redo=true (עולה כסף, צריך אישור), והעבירי שוב את הרפרנסים.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%style_bible באנגלית%';
