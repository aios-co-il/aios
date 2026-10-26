-- After production starts Carmen reads its real state instead of promising or retrying.

UPDATE public.ai_skills
SET system_prompt = system_prompt || E'\n- אחרי workshop_produce_video הסרט נבנה בשרת הפקה ברקע ויופיע בלוח לבד. אל תקראי להפקה שוב. כשמבקשים עדכון, או כשהסרט לא מופיע, קראי ל-workshop_get_state וקראי את production.summary ואמרי אותו למשתמש כמו שהוא. אם stalled=true, השרת לא קולט משימות בסביבה הזו, ואמרי את זה בפשטות במקום להבטיח זמן.'
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND system_prompt NOT LIKE '%production.summary%';
