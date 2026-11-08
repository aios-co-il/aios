-- Client card: four update types, and a held call or meeting written in the
-- text counts as client contact (AIO-516, David 2026-11-08).
--
-- 1. The types a person or Carmen gives a card entry are four:
--      call           פגישה / שיחה
--      weekly_update  עדכון שבועי
--      general        עדכון כללי
--      red_flag       דגל אדום
--    normalize_client_update_type() maps the older names (meeting, note,
--    other, whatsapp, email, import, complaint, no type) onto them. Kinds that
--    other flows write and read by name (mood_status, pulse_override,
--    seo_update, monthly_seo, meeting_summary, report and send kinds, group
--    digests, agent_action) keep their name.
-- 2. client_update_reports_contact() is the one rule for "the text reports a
--    call or meeting that was held": דיברתי איתו, דיברנו, שוחחנו, נפגשנו,
--    התקשרתי, היה זום / התקיימה פגישה. A clause that is a question, is
--    negated (לא / טרם / אין) or reports no answer does not count; plans
--    (נדבר מחר, צריך לדבר, קבענו פגישה) never match.
-- 3. A BEFORE trigger stores the normalized type on every write, and on a row
--    that may count as contact (source human or carmen_confirmed) stamps
--    counts_as_contact when the text reports contact, marking the stamp
--    metadata.contact_auto so an edit can take it back. An explicit
--    counts_as_contact set by another flow is never cleared.
-- 4. Existing rows: types normalized, auto stamps backfilled.
-- 5. get_latest_client_call_updates (the pulse, and the manager round's
--    contact evidence through it) counts counts_as_contact or a call; the old
--    phone-call-only text rule client_update_documents_phone_call is replaced.
-- Sends nothing.

-- ─── 1. The four types ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_client_update_type(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type IS NULL OR btrim(p_type) = '' THEN 'general'
    WHEN lower(btrim(p_type)) IN ('call', 'meeting') THEN 'call'
    WHEN lower(btrim(p_type)) = 'weekly_update' THEN 'weekly_update'
    WHEN lower(btrim(p_type)) IN ('general', 'note', 'other', 'whatsapp', 'email', 'import') THEN 'general'
    WHEN lower(btrim(p_type)) IN ('red_flag', 'complaint') THEN 'red_flag'
    ELSE p_type
  END;
$$;

COMMENT ON FUNCTION public.normalize_client_update_type(text) IS
  'The stored client card update type: call (פגישה / שיחה), weekly_update, general or red_flag for what a person or Carmen types; other flows'' kinds unchanged (AIO-516).';

-- ─── 2. The text reports a held call or meeting ─────────────────────────────

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
  'True when a client card entry''s text reports a call or meeting that was held (דיברתי איתו, נפגשנו, היה זום); questions, negations and no-answer calls do not count (AIO-516).';

-- ─── 3. Normalize and stamp on every write ──────────────────────────────────

-- Stores the normalized type and stamps counts_as_contact when the text of a
-- person's (or Carmen-for-a-person) entry reports a held call or meeting.
CREATE OR REPLACE FUNCTION public.client_updates_classify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_auto boolean;
BEGIN
  NEW.update_type := public.normalize_client_update_type(NEW.update_type);

  -- Only a person's entry, or one Carmen wrote for a named person, may count
  -- as contact (client-card/sources.ts CONTACT_COUNTING_SOURCES).
  IF COALESCE(NEW.source, 'human') NOT IN ('human', 'carmen_confirmed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A flag the writer set on purpose stays as it is.
    IF NEW.counts_as_contact IS NOT TRUE
       AND public.client_update_reports_contact(NEW.content) THEN
      NEW.counts_as_contact := true;
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || '{"contact_auto": true}'::jsonb;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_auto := COALESCE(OLD.metadata ->> 'contact_auto', '') = 'true';
    -- A flag another flow set on purpose stays as it is.
    IF OLD.counts_as_contact IS TRUE AND NOT v_auto THEN
      RETURN NEW;
    END IF;
    IF public.client_update_reports_contact(NEW.content) THEN
      NEW.counts_as_contact := true;
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || '{"contact_auto": true}'::jsonb;
    ELSIF v_auto THEN
      -- The edited text no longer reports contact: take the stamp back.
      NEW.counts_as_contact := NULL;
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'contact_auto';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 4. Existing rows ───────────────────────────────────────────────────────

UPDATE public.client_updates
SET update_type = public.normalize_client_update_type(update_type)
WHERE update_type IS DISTINCT FROM public.normalize_client_update_type(update_type);

UPDATE public.client_updates
SET counts_as_contact = true,
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"contact_auto": true}'::jsonb
WHERE COALESCE(source, 'human') IN ('human', 'carmen_confirmed')
  AND counts_as_contact IS NOT TRUE
  AND public.client_update_reports_contact(content);

DROP TRIGGER IF EXISTS client_updates_classify ON public.client_updates;
CREATE TRIGGER client_updates_classify
  BEFORE INSERT OR UPDATE OF update_type, content ON public.client_updates
  FOR EACH ROW EXECUTE FUNCTION public.client_updates_classify();

-- ─── 5. The pulse's counting rule ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_latest_client_call_updates(p_client_ids uuid[])
RETURNS TABLE (client_id uuid, last_client_call_at timestamptz, last_client_call_by text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  with latest as (
    select distinct on (updates.client_id)
      updates.client_id,
      updates.created_at,
      updates.user_id,
      updates.tenant_id
    from public.client_updates as updates
    where updates.client_id = any (p_client_ids)
      and updates.source in ('human', 'carmen_confirmed')
      and (updates.counts_as_contact is true or updates.update_type = 'call')
    order by updates.client_id, updates.created_at desc
  )
  select latest.client_id,
         latest.created_at,
         coalesce(
           nullif(btrim(profiles.full_name), ''),
           departed.full_name,
           case
             when departed.status = 'deleted' or profiles.deleted_at is not null then 'משתמש שנמחק'
             else profiles.email
           end
         )
  from latest
  left join public.profiles as profiles on profiles.id = latest.user_id
  left join lateral (
    select d.full_name, d.status
    from public.tenant_departed_members(array[latest.tenant_id]) as d
    where d.user_id = latest.user_id
  ) as departed on true;
$$;

DROP FUNCTION IF EXISTS public.client_update_documents_phone_call(text);
