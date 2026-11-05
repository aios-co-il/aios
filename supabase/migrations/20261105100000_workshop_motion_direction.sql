-- Carmen directs a scene's motion like a professional marketing manager, not a fashion model
-- (David, Nov 2026). The full guide lives in workshop_storyboard's motion_prompt description
-- (_shared/workshop/motion-direction.ts, adapted from DirectorSKILL, MIT); the skins that write
-- scenes get the short version and a pointer to it. Safe to re-run: the block between the markers
-- is replaced, never appended twice.

UPDATE public.ai_skills SET
  system_prompt = regexp_replace(
    COALESCE(system_prompt, ''),
    E'\\n*\\[motion-direction\\].*\\[/motion-direction\\]',
    ''
  ) || E'\n[motion-direction]\n'
    || $$כיוון תנועה (motion_prompt): כרמן היא מנהלת שיווק מקצועית, לא דוגמנית. התנועה משרתת את המסר.
- קודם: מה הצופה צריך להבין מהשורה בתסריט (קריינות, טקסט על המסך, מה רואים). הפעולה של כרמן מראה את הדבר הזה, ואם אין פעולה כזו היא נשארת בשקט.
- דמות אחת זזה, פעולה אחת, כיוון אחד, 2 עד 5 שניות. רק מה שמשתנה, לא איך היא נראית: התמונה כבר קובעת פנים, לבוש, מקום ואור.
- פעולות מקצועיות לפי הסקין: מציגה דשבורד, מצביעה על גרף, מסובבת את הלפטופ לצופה, מקלידה ומרימה מבט, מהנהנת. בלי פוזות, הנפת שיער, סיבובים, הליכת מסלול או הליכה למצלמה.
- מבט: למסך או למוצר כשהיא מציגה, לעדשה רק בפתיח ובקריאה לפעולה. מצלמה עם סיבה, תנועה אחת לשוט.
- תמיד מסיימים בתנוחת סיום עם שם ("ends looking into the lens, hand resting on the desk"). הכללים המלאים בתיאור motion_prompt של workshop_storyboard.
[/motion-direction]$$
WHERE slug IN ('workshop_producer', 'workshop_copywriter', 'carmen_workshop', 'video_director')
  AND scope = 'global';
