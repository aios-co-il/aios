-- Missing primary keys (20261101104000_missing_primary_keys): checks each
-- table's key, then upserts tenant_heartbeat_settings inside one transaction
-- that is rolled back.
BEGIN;
DO $test$
DECLARE
  k record;
  v_rel regclass;
  v_key text;
  v_tenant uuid;
  v_enabled boolean;
  v_rows bigint;
  v_max integer;
BEGIN
  FOR k IN
    SELECT * FROM (VALUES
      ('agent_action_log', 'id'),
      ('agent_approval_queue', 'id'),
      ('agent_eval_runs', 'id'),
      ('agent_evals', 'id'),
      ('agent_goals', 'id'),
      ('agent_knowledge_folders', 'id'),
      ('agent_knowledge_items', 'id'),
      ('agent_mcp_connections', 'id'),
      ('agent_memory', 'id'),
      ('agent_runs', 'id'),
      ('agent_supervisors', 'id'),
      ('agent_tools', 'id'),
      ('agent_user_profiles', 'id'),
      ('ahrefs_reports', 'id'),
      ('ai_skills', 'id'),
      ('automation_executions', 'id'),
      ('campaign_alerts', 'id'),
      ('campaign_schedules', 'id'),
      ('carmen_memory_episodes', 'id'),
      ('carmen_memory_outbox', 'id'),
      ('carmen_memory_pointers', 'id'),
      ('carmen_whatsapp_sessions', 'id'),
      ('communication_logs', 'id'),
      ('heartbeat_logs', 'id'),
      ('integration_alerts_log', 'id'),
      ('integration_health', 'id'),
      ('invoice_uploads', 'id'),
      ('job_queue', 'id'),
      ('marketing_item_transitions', 'id'),
      ('marketing_media_library', 'id'),
      ('marketing_runs', 'id'),
      ('marketing_stage_templates', 'id'),
      ('marketing_triggers', 'id'),
      ('maskyoo_manual_overrides', 'id'),
      ('maskyoo_numbers', 'id'),
      ('maskyoo_settings', 'id'),
      ('processed_events', 'id'),
      ('seo_call_snapshots', 'id'),
      ('seo_monthly_updates', 'id'),
      ('social_comments', 'id'),
      ('social_publications', 'id'),
      ('telegram_bot_state', 'id'),
      ('telegram_messages', 'id'),
      ('tenant_heartbeat_settings', 'tenant_id'),
      ('tenant_rate_limits', 'id'),
      ('user_workspace_layout', 'id'),
      ('whatsapp_sessions', 'id'),
      ('woocommerce_customers', 'id'),
      ('woocommerce_orders', 'id'),
      ('woocommerce_products', 'id'),
      ('woocommerce_sync_log', 'id')
    ) AS t (table_name, column_name)
  LOOP
    v_rel := to_regclass(format('public.%I', k.table_name));
    IF v_rel IS NULL THEN
      RAISE EXCEPTION 'key: public.% must exist', k.table_name;
    END IF;
    SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_key
    FROM pg_constraint AS c
    JOIN pg_attribute AS a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = v_rel AND c.contype = 'p';
    IF v_key IS DISTINCT FROM k.column_name THEN
      RAISE EXCEPTION 'key: public.% must have primary key (%), has (%)',
        k.table_name, k.column_name, coalesce(v_key, 'none');
    END IF;
  END LOOP;

  SELECT t.id INTO v_tenant FROM public.tenants AS t ORDER BY t.id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  SELECT s.enabled INTO v_enabled FROM public.tenant_heartbeat_settings AS s
  WHERE s.tenant_id = v_tenant;

  -- The settings save: an upsert on tenant_id, whether the row exists or not.
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, max_concurrent_tasks)
  VALUES (v_tenant, 5)
  ON CONFLICT (tenant_id) DO UPDATE SET max_concurrent_tasks = EXCLUDED.max_concurrent_tasks;
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, max_concurrent_tasks)
  VALUES (v_tenant, 7)
  ON CONFLICT (tenant_id) DO UPDATE SET max_concurrent_tasks = EXCLUDED.max_concurrent_tasks;
  SELECT count(*), max(s.max_concurrent_tasks) INTO v_rows, v_max
  FROM public.tenant_heartbeat_settings AS s WHERE s.tenant_id = v_tenant;
  IF v_rows <> 1 OR v_max <> 7 THEN
    RAISE EXCEPTION 'upsert: the tenant must have one row with the last value (% rows, max %)', v_rows, v_max;
  END IF;
  IF v_enabled IS NOT NULL
     AND (SELECT s.enabled FROM public.tenant_heartbeat_settings AS s WHERE s.tenant_id = v_tenant)
       IS DISTINCT FROM v_enabled THEN
    RAISE EXCEPTION 'upsert: a column the save leaves out must keep its stored value';
  END IF;

  -- A second row for the same tenant is refused.
  BEGIN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id) VALUES (v_tenant);
    RAISE EXCEPTION 'Expected rejection';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$test$;
SELECT 'missing primary keys: keys and heartbeat settings upsert passed' AS result;
ROLLBACK;
