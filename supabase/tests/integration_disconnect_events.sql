-- Integration disconnects (20261104120000_integration_disconnect_events,
-- AIO-342): the trigger calls this project's trigger-automation from Vault,
-- one event per disconnect, none for a connection already disconnected, and
-- what the pulse reads. Staging only: the test's own tenants, agency,
-- connections and tables, Vault secrets only when missing, and a full
-- rollback, so no queued call is ever sent.
BEGIN;
DO $test$
DECLARE
  def text;
  v_url text;
  v_key text;
  t_owner uuid; t_shared uuid; t_unrelated uuid;
  v_agency uuid;
  v_conn uuid; v_old uuid; v_manual uuid;
  calls_before integer;
  calls_after integer;
  v_row record;
  v_open integer;
BEGIN
  -- The trigger reads the project URL and key from Vault and names no project.
  def := pg_get_functiondef('public.trigger_integration_disconnected()'::regprocedure);
  IF def ~ 'supabase\.co' OR def ~ 'eyJ' THEN
    RAISE EXCEPTION 'vault: the trigger must not hold a project URL or key';
  END IF;
  IF position('vault.decrypted_secrets' IN def) = 0
     OR position('project_url' IN def) = 0
     OR position('service_role_key' IN def) = 0 THEN
    RAISE EXCEPTION 'vault: the trigger must read project_url and service_role_key from Vault';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret('https://harness-project.example', 'project_url');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret('harness-service-key', 'service_role_key');
  END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK owner', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_owner;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK shared', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_shared;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK unrelated', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_unrelated;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK agency', t_owner) RETURNING id INTO v_agency;
  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id)
  VALUES (t_owner, v_agency, t_shared);

  -- A connected Google Ads connection, one already disconnected before this
  -- release, and one a person will switch off.
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, settings, display_name)
  VALUES (t_owner, 'google_ads', true, '{"needs_reauth": false}', 'ads@qa.example') RETURNING id INTO v_conn;
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, settings)
  VALUES (t_owner, 'google_analytics', true, '{"needs_reauth": true}') RETURNING id INTO v_old;
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, settings)
  VALUES (t_owner, 'google_search_console', true, '{}') RETURNING id INTO v_manual;

  -- Report tables pinned to the connection: the owner's, an agency-shared
  -- org's, and one in an org with no share (counted, never named).
  INSERT INTO public.crm_tables (tenant_id, name, slug, integration_type, integration_settings)
  VALUES (t_owner, 'QA owner table', 'qa-' || gen_random_uuid(), 'google_ads', jsonb_build_object('integrationId', v_conn)),
         (t_shared, 'QA shared table', 'qa-' || gen_random_uuid(), 'google_ads', jsonb_build_object('integrationId', v_conn)),
         (t_unrelated, 'QA unrelated table', 'qa-' || gen_random_uuid(), 'google_ads', jsonb_build_object('integration_id', v_conn));

  -- A lost token: one event, and one call to this project's trigger-automation.
  SELECT count(*) INTO calls_before FROM net.http_request_queue
  WHERE url = rtrim(v_url, '/') || '/functions/v1/trigger-automation';
  UPDATE public.tenant_integrations
  SET is_active = false,
      settings = settings || '{"needs_reauth": true, "last_auth_error": "invalid_grant"}'
  WHERE id = v_conn;
  SELECT count(*) INTO calls_after FROM net.http_request_queue
  WHERE url = rtrim(v_url, '/') || '/functions/v1/trigger-automation'
    AND headers ->> 'Authorization' = 'Bearer ' || v_key;
  IF calls_after <> calls_before + 1 THEN
    RAISE EXCEPTION 'vault: the disconnect must queue one call to this project (% -> %)', calls_before, calls_after;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.integration_disconnect_events
                 WHERE integration_id = v_conn AND tenant_id = t_owner
                   AND reconnected_at IS NULL AND reason = 'invalid_grant') THEN
    RAISE EXCEPTION 'event: a lost connection must open one event';
  END IF;

  -- Still disconnected: no second event and no second call.
  UPDATE public.tenant_integrations
  SET settings = settings || '{"last_auth_error": "invalid_grant again"}'
  WHERE id = v_conn;
  SELECT count(*) INTO v_open FROM public.integration_disconnect_events WHERE integration_id = v_conn;
  IF v_open <> 1 THEN
    RAISE EXCEPTION 'event: a connection that stays disconnected must keep one event, got %', v_open;
  END IF;
  SELECT count(*) INTO calls_after FROM net.http_request_queue
  WHERE url = rtrim(v_url, '/') || '/functions/v1/trigger-automation';
  IF calls_after <> calls_before + 1 THEN
    RAISE EXCEPTION 'vault: a connection that stays disconnected must not call again';
  END IF;

  -- What the pulse reads: the label, the account, three pinned tables, and
  -- only the agency-shared org by name.
  SELECT * INTO v_row FROM public.pulse_open_integration_disconnects(t_owner);
  IF v_row.integration_id IS DISTINCT FROM v_conn
     OR v_row.provider_label <> 'Google Ads'
     OR v_row.account_label <> 'ads@qa.example'
     OR v_row.report_tables <> 3
     OR v_row.shared_with_tenants <> ARRAY['QA ROLLBACK shared'] THEN
    RAISE EXCEPTION 'pulse: unexpected open disconnect %', row_to_json(v_row);
  END IF;
  IF (SELECT count(*) FROM public.pulse_open_integration_disconnects(t_shared)) <> 0 THEN
    RAISE EXCEPTION 'pulse: only the connection''s own org reads its disconnect';
  END IF;

  -- No replay: the connection disconnected before this release opens nothing,
  -- and neither does a person switching a connection off.
  UPDATE public.tenant_integrations
  SET is_active = false, settings = settings || '{"last_auth_error": "invalid_grant"}'
  WHERE id = v_old;
  UPDATE public.tenant_integrations SET is_active = false WHERE id = v_manual;
  IF EXISTS (SELECT 1 FROM public.integration_disconnect_events WHERE integration_id IN (v_old, v_manual)) THEN
    RAISE EXCEPTION 'replay: a connection already disconnected, or switched off, must open no event';
  END IF;

  -- A reconnect closes the event; the pulse reads nothing.
  UPDATE public.tenant_integrations
  SET is_active = true, settings = settings - 'needs_reauth' - 'last_auth_error'
  WHERE id = v_conn;
  IF EXISTS (SELECT 1 FROM public.integration_disconnect_events
             WHERE integration_id = v_conn AND reconnected_at IS NULL) THEN
    RAISE EXCEPTION 'reconnect: the event must close';
  END IF;
  IF (SELECT count(*) FROM public.pulse_open_integration_disconnects(t_owner)) <> 0 THEN
    RAISE EXCEPTION 'reconnect: a reconnected connection must not reach the pulse';
  END IF;

  -- Lost again: a new event.
  UPDATE public.tenant_integrations
  SET settings = settings || '{"needs_reauth": true}'
  WHERE id = v_conn;
  IF (SELECT count(*) FROM public.integration_disconnect_events WHERE integration_id = v_conn) <> 2
     OR (SELECT count(*) FROM public.integration_disconnect_events
         WHERE integration_id = v_conn AND reconnected_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'reconnect: a new loss after a reconnect must open a second event';
  END IF;

  -- Server only.
  IF has_function_privilege('anon', 'public.pulse_open_integration_disconnects(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pulse_open_integration_disconnects(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: only the service role may read open disconnects';
  END IF;
  IF has_table_privilege('anon', 'public.integration_disconnect_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.integration_disconnect_events', 'SELECT') THEN
    RAISE EXCEPTION 'grants: signed-in users must not read disconnect events';
  END IF;

  -- One of each object, however often the migration ran.
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.tenant_integrations'::regclass
        AND tgname IN ('on_integration_disconnected', 'on_integration_disconnect_event')) <> 2 THEN
    RAISE EXCEPTION 'idempotent: expected exactly the two disconnect triggers';
  END IF;
END
$test$;
ROLLBACK;
