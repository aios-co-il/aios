-- AIO-238: nightly reconciliation of AIOS ad reports against Meta and Google.
--
-- carmen-reconcile-worker compares, per report table (facebook_insights,
-- facebook_ecommerce, google_ads), the last 7 complete days in the ad account's
-- time zone, campaign by campaign and day by day, and stores what it found here.
-- Report-only: nothing is sent. Optional auto-resync is per table through
-- crm_tables.integration_settings.reconcile_autoresync (absent = off).
--
-- Reads mirror crm_tables: a run or finding is visible to whoever can see its
-- report table. Tenant-level rows (unmapped ad accounts, table_id NULL) are for
-- the tenant's owners. Writes are service role only.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reconcile_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.crm_tables(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  platform text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL,
  window_start date,
  window_end date,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT reconcile_runs_status_check
    CHECK (status IN ('running', 'ok', 'mismatch', 'failed', 'skipped')),
  CONSTRAINT reconcile_runs_platform_check
    CHECK (platform IS NULL OR platform IN ('meta', 'google'))
);

COMMENT ON TABLE public.reconcile_runs IS
  'One reconciliation of a report table (or, with table_id NULL, of a tenant''s org-level Meta ad accounts) against the ad platform. window_start/window_end are the days actually compared (days still waiting for a sync are in summary.pending_dates). summary holds counts, totals, the account time zone, pending dates, top_findings and a redacted error. A run a rate limit stopped (skipped with skipped_reason platform_rate_limited, or failed with error_kind rate_limit) compared nothing, and readers look past it to the previous result. A tenant-level run with summary.unmapped_check = no_org_connections means the tenant has only private Meta connections, which the check never reads. Written by carmen-reconcile-worker only.';

CREATE TABLE IF NOT EXISTS public.reconcile_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.reconcile_runs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  table_id uuid REFERENCES public.crm_tables(id) ON DELETE CASCADE,
  campaign_id text,
  date date,
  kind text NOT NULL,
  metric text,
  aios_value numeric,
  platform_value numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconcile_findings_kind_check
    CHECK (kind IN (
      'mismatch',
      'missing_day',
      'missing_in_aios',
      'missing_on_platform',
      'unmapped_account'
    ))
);

COMMENT ON TABLE public.reconcile_findings IS
  'A difference between AIOS and the ad platform found by a reconcile run: mismatch (campaign/day/metric beyond max(2%, 20 in account currency; 1 for result counts)), missing_day, missing_in_aios, missing_on_platform, unmapped_account.';

CREATE INDEX IF NOT EXISTS reconcile_runs_table_started_idx
  ON public.reconcile_runs (table_id, started_at DESC);
CREATE INDEX IF NOT EXISTS reconcile_runs_tenant_started_idx
  ON public.reconcile_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS reconcile_runs_client_started_idx
  ON public.reconcile_runs (client_id, started_at DESC)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reconcile_findings_run_idx
  ON public.reconcile_findings (run_id);
CREATE INDEX IF NOT EXISTS reconcile_findings_table_date_idx
  ON public.reconcile_findings (table_id, date);
CREATE INDEX IF NOT EXISTS reconcile_findings_tenant_client_idx
  ON public.reconcile_findings (tenant_id, client_id);

-- ── Access ────────────────────────────────────────────────────────────────

ALTER TABLE public.reconcile_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconcile_findings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reconcile_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reconcile_findings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reconcile_runs TO authenticated;
GRANT SELECT ON TABLE public.reconcile_findings TO authenticated;
GRANT ALL ON TABLE public.reconcile_runs TO service_role;
GRANT ALL ON TABLE public.reconcile_findings TO service_role;

-- The crm_tables subquery runs under the caller's own crm_tables policies
-- (owners, team managers, campaigners, SEO, shared agencies, super admins), so
-- these reads follow exactly who may open the report.
DROP POLICY IF EXISTS "Read reconcile runs of visible report tables" ON public.reconcile_runs;
CREATE POLICY "Read reconcile runs of visible report tables"
  ON public.reconcile_runs FOR SELECT TO authenticated
  USING (
    (table_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.crm_tables t WHERE t.id = reconcile_runs.table_id
    ))
    OR (table_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.has_role(auth.uid(), 'owner'::public.app_role)
      )
    ))
  );

DROP POLICY IF EXISTS "Read reconcile findings of visible report tables" ON public.reconcile_findings;
CREATE POLICY "Read reconcile findings of visible report tables"
  ON public.reconcile_findings FOR SELECT TO authenticated
  USING (
    (table_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.crm_tables t WHERE t.id = reconcile_findings.table_id
    ))
    OR (table_id IS NULL AND (
      public.is_super_admin(auth.uid())
      OR (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.has_role(auth.uid(), 'owner'::public.app_role)
      )
    ))
  );

-- ── Chained worker calls ───────────────────────────────────────────────────
-- Same function as the baseline, with carmen-reconcile-worker added to the
-- allow-list so each chunk can queue the next one through pg_net.

CREATE OR REPLACE FUNCTION public.kick_internal_function(p_function text, p_body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  project_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_function NOT IN (
    'cron-sync-google-ads',
    'cron-sync-facebook-insights',
    'cron-sync-facebook-ecommerce',
    'cron-sync-google-analytics',
    'carmen-reconcile-worker'
  ) THEN
    RAISE EXCEPTION 'invalid function';
  END IF;

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name IN ('SUPABASE_URL', 'supabase_url', 'project_url')
  ORDER BY CASE name WHEN 'SUPABASE_URL' THEN 0 WHEN 'supabase_url' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT decrypted_secret INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name IN ('service_role_key', 'SUPABASE_SERVICE_ROLE_KEY')
  ORDER BY CASE name WHEN 'service_role_key' THEN 0 ELSE 1 END
  LIMIT 1;

  IF project_url IS NULL OR worker_secret IS NULL OR worker_secret = '' THEN
    RAISE EXCEPTION 'kick secrets missing';
  END IF;

  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 150000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kick_internal_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_internal_function(text, jsonb) TO service_role;

-- ── Nightly schedule ───────────────────────────────────────────────────────
-- 01:30 UTC, before the morning syncs (02:40 UTC). The worker skips
-- yesterday until a sync has run after it ended, so the partial day is not
-- reported. Nothing in git carries a URL or a key: the cron command reads both
-- from Vault at run time (secrets `project_url` and `service_role_key`). When
-- cron/vault or either secret is missing, the migration skips with a NOTICE.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'carmen-reconcile cron: pg_cron or vault not installed, skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'carmen-reconcile-nightly') THEN
    RAISE NOTICE 'carmen-reconcile cron: job already exists, left unchanged';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM vault.secrets
      WHERE name IN ('project_url', 'service_role_key')) < 2 THEN
    RAISE NOTICE 'carmen-reconcile cron: vault secrets project_url / service_role_key missing, skipped';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'carmen-reconcile-nightly',
    '30 1 * * *',
    $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/carmen-reconcile-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 150000
      );
    $cron$
  );
END;
$$;
