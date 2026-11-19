-- Landing page projects (AIO-607): Carmen now builds the approved page and publishes it after the
-- user approves the preview. Appends the two steps to the Workshop prompts that already describe
-- the copy and style steps; runs once (guarded by the tool's name).
UPDATE public.ai_skills
   SET system_prompt = system_prompt || E'\n\nעמוד נחיתה, בנייה ופרסום: אחרי שהמשתמש אישר את הקופי ואת הסגנון, workshop_build_landing_page בונה את העמוד כטיוטה ומחזיר קישור לתצוגה מקדימה. שולחים למשתמש את הקישור ומחכים לאישור שלו. רק אחרי שאישר לפרסם: workshop_publish_landing_page. שינוי אחרי תצוגה: קופי או סגנון מתוקן, אישור, ובנייה מחדש.'
 WHERE slug IN ('carmen_workshop', 'workshop_copywriter')
   AND system_prompt NOT LIKE '%workshop_build_landing_page%';
