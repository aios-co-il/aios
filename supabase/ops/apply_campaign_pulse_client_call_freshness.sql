-- Superseded by 20261009000000_production_baseline.sql; retire this script
-- once the open branches that still edit it land (AIO-124).
-- Add client-contact freshness to the deterministic campaign pulse.
-- A "call" is the structured update_type selected in the client card updates tab.

ALTER TABLE public.campaign_pulse_snapshots
  ADD COLUMN IF NOT EXISTS last_client_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_client_call_by text;

COMMENT ON COLUMN public.campaign_pulse_snapshots.last_client_call_at IS
  'Timestamp of the latest client_updates row whose update_type is call.';
COMMENT ON COLUMN public.campaign_pulse_snapshots.last_client_call_by IS
  'Display name or email of the user who recorded the latest client call update.';

CREATE OR REPLACE FUNCTION public.client_update_documents_phone_call(p_content text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(btrim(p_content), '') = '' THEN false
    WHEN p_content ~* '(לא|טרם|עוד לא)[[:space:]]+([^[:space:]]+[[:space:]]+){0,2}(לדבר|דיבר|שוחח)'
      OR p_content ~* 'אין[[:space:]]+מענה'
      OR p_content ~* '(הלקוח|הלקוחה)[[:space:]]+לא[[:space:]]+(ענה|ענתה)'
      THEN false
    ELSE p_content ~* '(דיברתי|דיברנו|דיברה|דיבר|שוחחתי|שוחחנו|שוחחה|שוחח).{0,40}(טלפונית|בטלפון|עם[[:space:]]+(הלקוח|הלקוחה))'
      OR p_content ~* '(טלפונית|בטלפון).{0,40}(דיברתי|דיברנו|דיברה|דיבר|שוחחתי|שוחחנו|שוחחה|שוחח)'
      OR p_content ~* '(שיחה טלפונית|שיחת טלפון).{0,30}(הלקוח|הלקוחה|לקוח|לקוחה)'
      OR p_content ~* 'בוצעה[[:space:]]+שיחה.{0,20}(הלקוח|הלקוחה|לקוח|לקוחה)'
  END;
$$;

REVOKE ALL ON FUNCTION public.client_update_documents_phone_call(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_update_documents_phone_call(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_latest_client_call_updates(p_client_ids uuid[])
RETURNS TABLE (
  client_id uuid,
  last_client_call_at timestamptz,
  last_client_call_by text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (updates.client_id)
    updates.client_id,
    updates.created_at AS last_client_call_at,
    COALESCE(NULLIF(profiles.full_name, ''), profiles.email) AS last_client_call_by
  FROM public.client_updates AS updates
  LEFT JOIN public.profiles AS profiles ON profiles.id = updates.user_id
  WHERE updates.client_id = ANY (p_client_ids)
    AND (
      updates.update_type = 'call'
      OR (
        updates.update_type = 'weekly_update'
        AND public.client_update_documents_phone_call(updates.content)
      )
    )
  ORDER BY updates.client_id, updates.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_latest_client_call_updates(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_client_call_updates(uuid[])
  TO service_role;

-- Mark existing qualifying weekly notes as calls so the client-card history and
-- future pulse reads use the same structured update type.
UPDATE public.client_updates
SET update_type = 'call',
    updated_at = now()
WHERE update_type = 'weekly_update'
  AND public.client_update_documents_phone_call(content);
