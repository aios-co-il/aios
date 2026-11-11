-- Inactive clients stop syncing (20261111140000_inactive_clients_stop_report_sync):
-- when a client moves to paused, ended or inactive, its report tables are
-- switched off (campaign_active = false), the flag the scheduled syncs skip.
-- A move between two inactive statuses or back to active changes nothing,
-- and another client's tables stay on. anon and authenticated cannot execute
-- the trigger function. Without the migration the tables stay on and the
-- test fails. Synthetic rows, full rollback.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_report uuid := gen_random_uuid();
  v_other_report uuid := gen_random_uuid();
  v_tag text := left(gen_random_uuid()::text, 8);
BEGIN
  IF to_regprocedure('public.deactivate_reports_of_inactive_client()') IS NULL THEN
    RAISE EXCEPTION 'inactive clients: public.deactivate_reports_of_inactive_client() is missing';
  END IF;
  IF has_function_privilege('anon', 'public.deactivate_reports_of_inactive_client()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.deactivate_reports_of_inactive_client()', 'EXECUTE') THEN
    RAISE EXCEPTION 'inactive clients: anon or authenticated can execute the trigger function';
  END IF;

  -- Fixture: two active clients, each with a switched-on Facebook report.
  INSERT INTO public.tenants (id, name, slug) VALUES (v_tenant, 'QA inactive ' || v_tag, 'qa-inactive-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name, status) VALUES
    (v_client, v_tenant, v_agency, 'QA paused client', 'active'),
    (v_other, v_tenant, v_agency, 'QA active client', 'active');
  INSERT INTO public.crm_tables (id, tenant_id, client_id, name, slug, integration_type, campaign_active) VALUES
    (v_report, v_tenant, v_client, 'QA report', 'qa-report-' || v_tag, 'facebook_insights', true),
    (v_other_report, v_tenant, v_other, 'QA other report', 'qa-other-report-' || v_tag, 'facebook_insights', true);

  UPDATE public.clients SET status = 'paused' WHERE id = v_client;

  IF (SELECT campaign_active FROM public.crm_tables WHERE id = v_report) THEN
    RAISE EXCEPTION 'inactive clients: a paused client''s report is still switched on';
  END IF;
  IF NOT (SELECT campaign_active FROM public.crm_tables WHERE id = v_other_report) THEN
    RAISE EXCEPTION 'inactive clients: another client''s report was switched off';
  END IF;

  -- Back to active leaves the report as it is (no surprise switch-on).
  UPDATE public.clients SET status = 'active' WHERE id = v_client;
  IF (SELECT campaign_active FROM public.crm_tables WHERE id = v_report) THEN
    RAISE EXCEPTION 'inactive clients: reactivating the client switched its report back on';
  END IF;

  -- Ending the other client switches its report off too.
  UPDATE public.clients SET status = 'ended' WHERE id = v_other;
  IF (SELECT campaign_active FROM public.crm_tables WHERE id = v_other_report) THEN
    RAISE EXCEPTION 'inactive clients: an ended client''s report is still switched on';
  END IF;
END;
$test$;
ROLLBACK;
