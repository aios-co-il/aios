-- Report WhatsApp sender line (AIO-255).
--
-- Reports, dashboard shares and meeting summaries go out from one chosen
-- WhatsApp line: a Green API phone or a Manus line (Carmen's phone) that the
-- sending tenant owns or that another tenant shared with it through
-- integration_tenant_access. Meta Cloud numbers are not report senders: they
-- need approved templates.
--
-- 1. tenant_report_settings holds the tenant's default report line. Members
--    read it; only set_report_whatsapp_sender writes it.
-- 2. report_schedules.whatsapp_integration_id is a schedule's own line. NULL
--    follows the tenant default.
-- 3. report_whatsapp_sender_usable(tenant, line) is the one rule for "this
--    tenant may send reports from this line".
-- 4. set_report_whatsapp_sender lets tenant owners (and super admins) set the
--    default.
-- 5. list_report_whatsapp_senders returns the lines a tenant may send from,
--    without secrets, to members and to the report worker.
-- 6. A trigger refuses a schedule line the tenant may not use. It never
--    touches next_run_at, so choosing a line never sends anything.
-- 7. report-media is a private bucket for files sent through Manus, which
--    fetches media by URL. Only the service role reads or writes it.
--
-- No data changes: existing schedules keep a NULL line and no tenant has a
-- default, so nothing is sent or resent by this migration.

-- 1. The tenant's default report line.
CREATE TABLE IF NOT EXISTS public.tenant_report_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_integration_id uuid
    REFERENCES public.tenant_integrations(id) ON DELETE SET NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_report_settings IS
  'Per-tenant report delivery settings. Written only by set_report_whatsapp_sender.';
COMMENT ON COLUMN public.tenant_report_settings.whatsapp_integration_id IS
  'Default WhatsApp line (green_api or manus_wa, own or shared) for reports. NULL: the only line, else the sender''s own Green API line.';

ALTER TABLE public.tenant_report_settings ENABLE ROW LEVEL SECURITY;

-- Members of the tenant, and super admins, may read its report settings.
DROP POLICY IF EXISTS "Tenant members read report settings"
  ON public.tenant_report_settings;
CREATE POLICY "Tenant members read report settings"
  ON public.tenant_report_settings
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin(auth.uid())
  );

REVOKE ALL ON public.tenant_report_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_report_settings TO authenticated;
GRANT ALL ON public.tenant_report_settings TO service_role;

-- 2. A schedule's own line.
ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS whatsapp_integration_id uuid
    REFERENCES public.tenant_integrations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.report_schedules.whatsapp_integration_id IS
  'WhatsApp line this schedule sends from. NULL follows tenant_report_settings.';

-- 3. May this tenant send reports from this line? Active Green API or Manus
-- line, owned by the tenant or shared with it.
CREATE OR REPLACE FUNCTION public.report_whatsapp_sender_usable(
  p_tenant_id uuid,
  p_integration_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_integrations AS ti
    WHERE ti.id = p_integration_id
      AND ti.integration_type IN ('green_api', 'manus_wa')
      AND public.tenant_can_use_integration(p_tenant_id, ti.id)
  );
$$;

REVOKE ALL ON FUNCTION public.report_whatsapp_sender_usable(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_whatsapp_sender_usable(uuid, uuid)
  TO service_role;

-- Who may change a tenant's report settings: its owners and super admins.
CREATE OR REPLACE FUNCTION public.can_manage_report_settings(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND (
      public.is_super_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.tenant_users AS tu
        WHERE tu.tenant_id = p_tenant_id
          AND tu.user_id = p_user_id
          AND tu.role IN ('owner', 'agency_owner')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles AS ur
        WHERE ur.tenant_id = p_tenant_id
          AND ur.user_id = p_user_id
          AND ur.role = 'owner'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_report_settings(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_report_settings(uuid, uuid)
  TO service_role;

-- 4. Sets the tenant's default report line; no line (NULL) clears it.
CREATE OR REPLACE FUNCTION public.set_report_whatsapp_sender(
  p_tenant_id uuid,
  p_integration_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_manage_report_settings(p_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'report_settings_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_integration_id IS NOT NULL
     AND NOT public.report_whatsapp_sender_usable(p_tenant_id, p_integration_id) THEN
    RAISE EXCEPTION 'report_sender_not_allowed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_report_settings AS s
    (tenant_id, whatsapp_integration_id, updated_by, updated_at)
  VALUES (p_tenant_id, p_integration_id, auth.uid(), now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET whatsapp_integration_id = EXCLUDED.whatsapp_integration_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_report_whatsapp_sender(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_whatsapp_sender(uuid, uuid)
  TO authenticated, service_role;

-- 5. The lines a tenant may send reports from, for its members and for the
-- report worker (service role). Returns labels and readiness, never api_key,
-- because tenant_integrations rows are readable by every member.
CREATE OR REPLACE FUNCTION public.list_report_whatsapp_senders(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  integration_type text,
  display_name text,
  last4 text,
  owner_user_id uuid,
  owner_name text,
  owner_tenant_id uuid,
  owner_tenant_name text,
  is_shared boolean,
  carmen_role text,
  ready boolean,
  group_chat_ids text[],
  caller_can_manage boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF NOT v_is_service
     AND NOT public.user_is_tenant_member(p_tenant_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'report_settings_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ti.id,
    ti.integration_type,
    nullif(btrim(ti.display_name), ''),
    right(
      coalesce(
        nullif(ti.api_token_last_4, ''),
        nullif(ti.instance_id, ''),
        nullif(ti.settings ->> 'instance_id', '')
      ),
      4
    ),
    ti.user_id,
    p.full_name,
    ti.tenant_id,
    t.name,
    ti.tenant_id <> p_tenant_id,
    ti.settings ->> 'carmen_role',
    coalesce(ti.api_key, '') <> ''
      AND coalesce(ti.settings ->> 'instance_id', '') <> '',
    CASE
      WHEN jsonb_typeof(ti.settings #> '{manus_groups_sync,group_chat_ids}') = 'array'
      THEN ARRAY(
        SELECT jsonb_array_elements_text(
          ti.settings #> '{manus_groups_sync,group_chat_ids}'
        )
      )
    END,
    public.can_manage_report_settings(p_tenant_id, auth.uid())
  FROM public.tenant_integrations AS ti
  LEFT JOIN public.profiles AS p ON p.id = ti.user_id
  LEFT JOIN public.tenants AS t ON t.id = ti.tenant_id
  -- The tenant/grant filter narrows the scan; report_whatsapp_sender_usable
  -- stays the rule that decides.
  WHERE (
      ti.tenant_id = p_tenant_id
      OR EXISTS (
        SELECT 1
        FROM public.integration_tenant_access AS ita
        WHERE ita.integration_id = ti.id
          AND ita.accessing_tenant_id = p_tenant_id
      )
    )
    AND public.report_whatsapp_sender_usable(p_tenant_id, ti.id)
  ORDER BY ti.integration_type DESC, ti.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.list_report_whatsapp_senders(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_report_whatsapp_senders(uuid)
  TO authenticated, service_role;

-- 6. A schedule may only name a line its tenant may use. Checked when the
-- line or the tenant changes, so a line that was later switched off does not
-- stop anyone from editing or disabling the schedule.
CREATE OR REPLACE FUNCTION public.check_report_schedule_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.whatsapp_integration_id IS NOT DISTINCT FROM OLD.whatsapp_integration_id
     AND NEW.tenant_id = OLD.tenant_id THEN
    RETURN NEW;
  END IF;

  IF NEW.whatsapp_integration_id IS NOT NULL
     AND NOT public.report_whatsapp_sender_usable(
       NEW.tenant_id,
       NEW.whatsapp_integration_id
     ) THEN
    RAISE EXCEPTION 'report_sender_not_allowed' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_report_schedule_sender()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS report_schedules_check_sender ON public.report_schedules;
CREATE TRIGGER report_schedules_check_sender
  BEFORE INSERT OR UPDATE OF whatsapp_integration_id, tenant_id
  ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_report_schedule_sender();

-- 7. Private media for Manus file sends (signed URLs only, no policies).
DO $report_media$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'report-media bucket: storage schema not installed, skipped';
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit)
  VALUES ('report-media', 'report-media', false, 20971520)
  ON CONFLICT (id) DO NOTHING;
END
$report_media$;
