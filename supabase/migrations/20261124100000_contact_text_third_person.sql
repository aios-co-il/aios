-- A card entry that reports the client called or spoke ("גיא התקשר", "התקשר
-- ביקש…", "דיבר טלפונית עם הלקוח") counts as contact, like one in the first
-- person (AIO-516). Plans ("מחר", "צריך"), written channels (WhatsApp, the
-- group, email), leads and instructions ("התקשר אליו") do not, so "דיברו
-- בוואטסאפ" and "התקשרו 4 לידים" stay uncounted; questions, negations and
-- no-answer calls stay excluded for every rule. The first-person rules are
-- unchanged (a written channel next to "דיברתי איתו" still counts there).

-- True when a client card entry's text reports a call or meeting that was held.
CREATE OR REPLACE FUNCTION public.client_update_reports_contact(p_content text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(bool_or(
      clause ~ '(^|[^א-ת])[וש]?(דיברתי|דברתי|דיברנו|דברנו|שוחחתי|שוחחנו|נפגשתי|נפגשנו|התקשרתי|התקשרנו)([^א-ת]|$)'
      OR clause ~ '(^|[^א-ת])[וש]?(דיבר|דיברה|שוחח|שוחחה)[[:space:]]+(עם|איתו|איתה|איתם|איתן)([^א-ת]|$)'
      OR clause ~ '(^|[^א-ת])[וש]?(היה|היתה|הייתה|התקיים|התקיימה|בוצע|בוצעה|קיימנו|עשינו|ערכנו)[[:space:]]+(לנו[[:space:]]+)?(זום|פגישה|פגישת|שיחה|שיחת|מפגש|ישיבה)'
      -- Someone else called or spoke ("גיא התקשר", "כשהתקשר אמר"): read per
      -- comma part, so a plan later in the sentence does not cancel the call.
      -- A part that plans, names a written channel, talks about leads or
      -- tells someone to call ("התקשר אליו") does not count.
      OR EXISTS (
        SELECT 1
        FROM regexp_split_to_table(clause, ',') AS part
        WHERE part ~ '(^|[^א-ת])(כש|[וש])?(התקשר|התקשרה|התקשרו|נפגשו|דיבר|דיברה|דיברו|שוחח|שוחחה|שוחחו)([^א-ת]|$)'
          AND part !~ '(^|[^א-ת])(מחר|צריך|צריכה|צריכים|יש[[:space:]]+ל|נא|בבקשה|תזכורת|לחזור|אמור|אמורה)([^א-ת]|$)'
          AND part !~ '(וו?א?טסאפ|ווצאפ|בקבוצה|במייל|במסרון|בהודעה|בצאט|בצ׳אט)'
          AND part !~ '(^|[^א-ת])(ליד|לידים)([^א-ת]|$)'
          AND part !~ '^[[:space:]]*[וש]?התקשר[[:space:]]+(ללקוח|ללקוחה|אליו|אליה|אליהם|לו|לה|להם)([^א-ת]|$)'
      )
    ), false)
  FROM regexp_split_to_table(COALESCE(p_content, ''), E'[.!\n]+') AS clause
  WHERE clause !~ '\?'
    AND clause !~ '(^|[^א-ת])(לא|טרם|אין)[[:space:]]+([^[:space:]]+[[:space:]]+){0,2}[וש]?(דיבר|דבר|שוחח|נפגש|התקשר|היה|היתה|הייתה|התקיים|התקיימה|בוצע|הצלח)'
    AND NOT (
      clause ~ 'התקשר'
      AND clause ~ '(לא[[:space:]]+(ענה|ענתה|עונה|זמין|זמינה|השיב|השיבה|חזר|חזרה)|אין[[:space:]]+מענה)'
    );
$$;

COMMENT ON FUNCTION public.client_update_reports_contact(text) IS
  'True when a client card entry''s text reports a call or meeting that was held (דיברתי איתו, נפגשנו, היה זום, גיא התקשר); questions, negations, plans, written channels and no-answer calls do not count (AIO-516).';

-- Stamp the entries of the last 45 days that the new rule now reads as
-- contact, the way the insert trigger would have. Only a person's or a
-- Carmen-for-a-person entry, never one already counted; the flag is set
-- directly, so client_updates_classify (fired by type or content) does not run.
UPDATE public.client_updates AS u
SET counts_as_contact = true,
    metadata = COALESCE(u.metadata, '{}'::jsonb) || '{"contact_auto": true}'::jsonb
WHERE u.created_at >= timestamptz '2026-10-10 00:00:00+00'
  AND COALESCE(u.source, 'human') IN ('human', 'carmen_confirmed')
  AND u.counts_as_contact IS NOT TRUE
  AND public.client_update_reports_contact(u.content);
