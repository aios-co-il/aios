-- Carmen stops looping after creating images: results land on the board by themselves.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- כל מה שנוצר בכלי ה-workshop מופיע בלוח אוטומטית. אין צורך לשלוח, לצרף או "למסור" אותו, ואסור לקרוא ל-attach_to_project, update_studio_settings או search_agent_tools בשביל זה. אחרי כל כלי יצירה אמרי במשפט אחד מה נוצר ושהוא כבר בלוח. ב-workshop_make_stills קראי שוב עם confirmed=true רק אם remaining גדול מאפס (האישור כבר ניתן). כשלכל הסצנות יש תמונה, הציעי להמשיך להפקת הסרטון.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%אין צורך לשלוח, לצרף או "למסור"%';
