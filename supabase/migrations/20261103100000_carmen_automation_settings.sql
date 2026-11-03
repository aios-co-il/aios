-- Per-org switches for Carmen's automations (AIO-314, epic AIO-312).
--
-- Global cron switches (update_system_cron_job) turn a job off for every org.
-- This table lets an org switch one automation off for itself. A worker reads
-- it before acting (supabase/functions/_shared/automations/switches.ts); no
-- row means on, so nothing changes on deploy. Keys live in that file.
--
-- Members of the org read its switches; owners, agency owners and a super
-- admin acting in the org write them (carmen_manager_is_owner). Edge workers
-- read with the service role.

CREATE TABLE IF NOT EXISTS public.carmen_automation_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, automation_key),
  CONSTRAINT carmen_automation_settings_key_chk
    CHECK (automation_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT carmen_automation_settings_config_chk
    CHECK (jsonb_typeof(config) = 'object')
);

COMMENT ON TABLE public.carmen_automation_settings IS
  'Per-org on/off and settings for Carmen automations; no row = on (AIO-314).';

-- Keeps updated_at current on every change.
DROP TRIGGER IF EXISTS trg_carmen_automation_settings_updated_at
  ON public.carmen_automation_settings;
CREATE TRIGGER trg_carmen_automation_settings_updated_at
  BEFORE UPDATE ON public.carmen_automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.carmen_automation_settings ENABLE ROW LEVEL SECURITY;

-- Members of the org, and super admins, read its switches.
DROP POLICY IF EXISTS carmen_automation_settings_select
  ON public.carmen_automation_settings;
CREATE POLICY carmen_automation_settings_select
  ON public.carmen_automation_settings
  FOR SELECT TO authenticated
  USING (
    public.user_is_tenant_member(tenant_id)
    OR public.is_super_admin((SELECT auth.uid()))
  );

-- Owners of the org (or a super admin acting in it) add a switch.
DROP POLICY IF EXISTS carmen_automation_settings_insert
  ON public.carmen_automation_settings;
CREATE POLICY carmen_automation_settings_insert
  ON public.carmen_automation_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.carmen_manager_is_owner(tenant_id));

-- Owners of the org (or a super admin acting in it) change a switch.
DROP POLICY IF EXISTS carmen_automation_settings_update
  ON public.carmen_automation_settings;
CREATE POLICY carmen_automation_settings_update
  ON public.carmen_automation_settings
  FOR UPDATE TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id))
  WITH CHECK (public.carmen_manager_is_owner(tenant_id));

-- Owners of the org (or a super admin acting in it) remove a switch (back to on).
DROP POLICY IF EXISTS carmen_automation_settings_delete
  ON public.carmen_automation_settings;
CREATE POLICY carmen_automation_settings_delete
  ON public.carmen_automation_settings
  FOR DELETE TO authenticated
  USING (public.carmen_manager_is_owner(tenant_id));

REVOKE ALL ON TABLE public.carmen_automation_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carmen_automation_settings TO authenticated;
GRANT ALL ON public.carmen_automation_settings TO service_role;
