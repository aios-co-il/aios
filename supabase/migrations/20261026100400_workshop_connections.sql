-- Carmen checks which keys are connected before saying she cannot make something.
-- Images work with OpenAI, Google or ElevenLabs; the workshop skin gets the check tool.

UPDATE public.ai_skills
SET
  system_prompt = system_prompt || E'\n- לפני שאת אומרת שאי אפשר ליצור משהו בגלל מפתח, קראי ל-workshop_check_connections. תמונות עובדות עם כל אחד מ-OpenAI, Google או ElevenLabs, והכלי עובר לספק הבא לבד. סרטון, קריינות ומוזיקה עובדים עם ElevenLabs. רק אם הבדיקה מראה שבאמת אין דרך, אמרי בדיוק מה חסר ואיפה מחברים.',
  allowed_tools = array_append(allowed_tools, 'workshop_check_connections')
WHERE slug = 'carmen_workshop'
  AND scope = 'global'
  AND NOT ('workshop_check_connections' = ANY (allowed_tools));
