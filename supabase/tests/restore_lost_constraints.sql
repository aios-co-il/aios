-- Restored and added constraints (20261103110000_restore_lost_constraints):
-- each foreign key, check, unique key and index exists, and the two keys left
-- out on purpose do not; the changed and new foreign keys have their ON DELETE
-- action; the 4 client keys whose orphans the migration archived are
-- validated; archive.orphan_rows exists, anon and authenticated cannot reach
-- it, and each archived row was deleted or, if only its link was cleared, kept;
-- a sample of the foreign keys, with every new tenant key, refuses a
-- row whose parent does not exist; every check refuses a value outside it; five
-- unique keys refuse a duplicate; check_rate_limit(uuid, text, integer) finds
-- its ON CONFLICT target. Then the deletes: an agent delete keeps its action
-- log and approval rows without the agent, a conversation delete keeps the
-- Carmen session without the link, a user delete keeps the SEO update without
-- the user and leaves communication_logs.updated_by alone, a client delete
-- keeps its marketing pipeline and work item and removes its communication
-- log, and a single DELETE of the tenant removes the rows behind the new tenant
-- keys and all its logs, one of them on another tenant's client. A NOT
-- VALID constraint passes the other checks: it still applies to new rows.
-- Synthetic tenant, user and rows, full rollback, so it runs on a scratch
-- database, a Preview branch or Staging.
--
-- Each refused insert must fail with the expected error class and name the
-- expected constraint, so a NOT NULL or another key cannot pass for it.
BEGIN;
DO $test$
DECLARE
  k record;
  v_rel regclass;
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_client_b uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_other_agency uuid := gen_random_uuid();
  v_other_client uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_agent_b uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_pipeline uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_log uuid := gen_random_uuid();
  v_seo uuid := gen_random_uuid();
  v_conversation uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_missing uuid := gen_random_uuid();
  v_status text;
  v_state text;
  v_constraint text;
  v_count bigint;
  v_tag text := left(gen_random_uuid()::text, 8);
BEGIN
  FOR k IN
    SELECT * FROM (VALUES
      ('agent_supervisors', 'agent_supervisors_supervisor_agent_id_child_agent_id_key', 'u'),
      ('agent_tools', 'agent_tools_tenant_id_name_key', 'u'),
      ('agent_user_profiles', 'agent_user_profiles_agent_id_contact_phone_key', 'u'),
      ('ai_skills', 'ai_skills_user_id_tenant_id_name_key', 'u'),
      ('automation_executions', 'unique_execution', 'u'),
      ('job_queue', 'unique_idempotency_key', 'u'),
      ('marketing_pipelines', 'marketing_pipelines_client_track_unique', 'u'),
      ('maskyoo_manual_overrides', 'maskyoo_manual_overrides_tenant_id_maskyoo_last9_period_day_key', 'u'),
      ('maskyoo_numbers', 'maskyoo_numbers_tenant_id_phone_last9_key', 'u'),
      ('tenant_rate_limits', 'unique_tenant_resource', 'u'),
      ('carmen_whatsapp_sessions', 'idx_carmen_sessions_automation', 'i'),
      ('communication_logs', 'idx_communication_logs_tenant', 'i'),
      ('woocommerce_customers', 'idx_woo_customers_tenant', 'i'),
      ('woocommerce_products', 'idx_woo_products_tenant', 'i'),
      ('woocommerce_sync_log', 'idx_woo_sync_log_tenant', 'i'),
      ('agent_runs', 'agent_runs_status_check', 'c'),
      ('campaign_schedules', 'campaign_schedules_action_check', 'c'),
      ('campaign_schedules', 'campaign_schedules_entity_type_check', 'c'),
      ('campaign_schedules', 'campaign_schedules_when_chk', 'c'),
      ('goals', 'goals_owner_type_check', 'c'),
      ('marketing_runs', 'marketing_runs_status_check', 'c'),
      ('marketing_stage_templates', 'marketing_stage_templates_default_approval_mode_check', 'c'),
      ('marketing_stage_templates', 'marketing_stage_templates_track_check', 'c'),
      ('marketing_triggers', 'marketing_triggers_schedule_preset_check', 'c'),
      ('marketing_triggers', 'marketing_triggers_trigger_type_check', 'c'),
      ('maskyoo_numbers', 'maskyoo_numbers_category_check', 'c'),
      ('seo_call_snapshots', 'seo_call_snapshots_category_check', 'c'),
      ('social_publications', 'social_publications_post_type_check', 'c'),
      ('social_publications', 'social_publications_status_check', 'c'),
      ('tasks', 'priority_value_range', 'c'),
      ('telegram_messages', 'telegram_messages_direction_check', 'c'),
      ('whatsapp_sessions', 'whatsapp_sessions_status_check', 'c'),
      ('agent_action_log', 'agent_action_log_agent_id_fkey', 'f'),
      ('agent_action_log', 'agent_action_log_tenant_id_fkey', 'f'),
      ('agent_approval_queue', 'agent_approval_queue_tenant_id_fkey', 'f'),
      ('agent_eval_runs', 'agent_eval_runs_agent_id_fkey', 'f'),
      ('agent_eval_runs', 'agent_eval_runs_eval_id_fkey', 'f'),
      ('agent_evals', 'agent_evals_agent_id_fkey', 'f'),
      ('agent_goals', 'agent_goals_agent_id_fkey', 'f'),
      ('agent_knowledge_folders', 'agent_knowledge_folders_agent_id_fkey', 'f'),
      ('agent_knowledge_folders', 'agent_knowledge_folders_parent_folder_id_fkey', 'f'),
      ('agent_knowledge_items', 'agent_knowledge_items_agent_id_fkey', 'f'),
      ('agent_knowledge_items', 'agent_knowledge_items_folder_id_fkey', 'f'),
      ('agent_mcp_connections', 'agent_mcp_connections_agent_id_fkey', 'f'),
      ('agent_memory', 'agent_memory_agent_id_fkey', 'f'),
      ('agent_runs', 'agent_runs_delegated_to_agent_id_fkey', 'f'),
      ('agent_runs', 'agent_runs_parent_run_id_fkey', 'f'),
      ('agent_runs', 'agent_runs_replay_of_run_id_fkey', 'f'),
      ('agent_tasks', 'agent_tasks_tenant_id_fkey', 'f'),
      ('agent_user_profiles', 'agent_user_profiles_agent_id_fkey', 'f'),
      ('ahrefs_reports', 'ahrefs_reports_agency_id_fkey', 'f'),
      ('ahrefs_reports', 'ahrefs_reports_client_id_fkey', 'f'),
      ('ahrefs_reports', 'ahrefs_reports_tenant_id_fkey', 'f'),
      ('ai_skills', 'ai_skills_tenant_id_fkey', 'f'),
      ('automation_executions', 'automation_executions_tenant_id_fkey', 'f'),
      ('automation_shared_tenants', 'automation_shared_tenants_automation_id_fkey', 'f'),
      ('automation_shared_tenants', 'automation_shared_tenants_tenant_id_fkey', 'f'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_ai_conversation_id_fkey', 'f'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_automation_id_fkey', 'f'),
      ('communication_logs', 'communication_logs_client_id_fkey', 'f'),
      ('communication_logs', 'communication_logs_tenant_id_fkey', 'f'),
      ('goals', 'goals_parent_goal_id_fkey', 'f'),
      ('goals', 'goals_tenant_id_fkey', 'f'),
      ('heartbeat_logs', 'heartbeat_logs_agent_id_fkey', 'f'),
      ('heartbeat_logs', 'heartbeat_logs_tenant_id_fkey', 'f'),
      ('integration_health', 'integration_health_tenant_id_fkey', 'f'),
      ('invoice_uploads', 'invoice_uploads_agency_id_fkey', 'f'),
      ('invoice_uploads', 'invoice_uploads_client_id_fkey', 'f'),
      ('invoice_uploads', 'invoice_uploads_finance_id_fkey', 'f'),
      ('invoice_uploads', 'invoice_uploads_supplier_id_fkey', 'f'),
      ('invoice_uploads', 'invoice_uploads_tenant_id_fkey', 'f'),
      ('job_queue', 'job_queue_tenant_id_fkey', 'f'),
      ('marketing_ab_variants', 'marketing_ab_variants_stage_id_fkey', 'f'),
      ('marketing_ab_variants', 'marketing_ab_variants_tenant_id_fkey', 'f'),
      ('marketing_ab_variants', 'marketing_ab_variants_work_item_id_fkey', 'f'),
      ('marketing_item_transitions', 'marketing_item_transitions_item_id_fkey', 'f'),
      ('marketing_pipeline_stages', 'marketing_pipeline_stages_parent_stage_id_fkey', 'f'),
      ('marketing_work_items', 'marketing_work_items_pipeline_id_fkey', 'f'),
      ('maskyoo_numbers', 'maskyoo_numbers_client_id_fkey', 'f'),
      ('processed_events', 'processed_events_tenant_id_fkey', 'f'),
      ('seo_monthly_updates', 'seo_monthly_updates_client_id_fkey', 'f'),
      ('seo_monthly_updates', 'seo_monthly_updates_tenant_id_fkey', 'f'),
      ('social_media_wordpress_sites', 'social_media_wordpress_sites_agency_id_fkey', 'f'),
      ('social_media_wordpress_sites', 'social_media_wordpress_sites_client_id_fkey', 'f'),
      ('social_publications', 'social_publications_page_id_fkey', 'f'),
      ('telegram_bot_state', 'telegram_bot_state_shared_from_state_id_fkey', 'f'),
      ('telegram_bot_state', 'telegram_bot_state_tenant_id_fkey', 'f'),
      ('telegram_messages', 'telegram_messages_client_id_fkey', 'f'),
      ('telegram_messages', 'telegram_messages_lead_id_fkey', 'f'),
      ('telegram_messages', 'telegram_messages_tenant_id_fkey', 'f'),
      ('tenant_heartbeat_settings', 'tenant_heartbeat_settings_tenant_id_fkey', 'f'),
      ('tenant_rate_limits', 'tenant_rate_limits_tenant_id_fkey', 'f'),
      ('woocommerce_customers', 'woocommerce_customers_site_id_fkey', 'f'),
      ('woocommerce_customers', 'woocommerce_customers_tenant_id_fkey', 'f'),
      ('woocommerce_orders', 'woocommerce_orders_site_id_fkey', 'f'),
      ('woocommerce_orders', 'woocommerce_orders_tenant_id_fkey', 'f'),
      ('woocommerce_products', 'woocommerce_products_site_id_fkey', 'f'),
      ('woocommerce_products', 'woocommerce_products_tenant_id_fkey', 'f'),
      ('woocommerce_sync_log', 'woocommerce_sync_log_site_id_fkey', 'f'),
      ('woocommerce_sync_log', 'woocommerce_sync_log_tenant_id_fkey', 'f'),
      ('seo_monthly_updates', 'seo_monthly_updates_updated_by_fkey', 'f'),
      ('agent_approval_queue', 'agent_approval_queue_agent_id_fkey', 'f')
    ) AS t (table_name, object_name, kind)
  LOOP
    v_rel := to_regclass(format('public.%I', k.table_name));
    IF k.kind = 'i' THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_index AS x
        WHERE x.indexrelid = to_regclass(format('public.%I', k.object_name)) AND x.indrelid = v_rel
      ) THEN
        RAISE EXCEPTION 'exists: index % on public.% is missing', k.object_name, k.table_name;
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_constraint AS c
      WHERE c.conrelid = v_rel AND c.conname = k.object_name AND c.contype = k.kind
    ) THEN
      RAISE EXCEPTION 'exists: constraint % on public.% is missing', k.object_name, k.table_name;
    END IF;
  END LOOP;

  -- Left out on purpose: the delete-user function would fail on the first, and the second would
  -- cascade a client delete into workshop work (or, as SET NULL, collide with the "no client" pipeline).
  FOR k IN
    SELECT * FROM (VALUES
      ('communication_logs', 'communication_logs_updated_by_fkey'),
      ('marketing_pipelines', 'marketing_pipelines_client_id_fkey')
    ) AS t (table_name, object_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint AS c
      WHERE c.conrelid = to_regclass(format('public.%I', k.table_name)) AND c.conname = k.object_name
    ) THEN
      RAISE EXCEPTION 'absent: constraint % on public.% must not exist', k.object_name, k.table_name;
    END IF;
  END LOOP;

  -- ON DELETE actions: a no action, c cascade, n set null.
  FOR k IN
    SELECT * FROM (VALUES
      ('agent_action_log', 'agent_action_log_agent_id_fkey', 'n'),
      ('agent_approval_queue', 'agent_approval_queue_agent_id_fkey', 'n'),
      ('carmen_whatsapp_sessions', 'carmen_whatsapp_sessions_ai_conversation_id_fkey', 'n'),
      ('seo_monthly_updates', 'seo_monthly_updates_updated_by_fkey', 'n'),
      ('communication_logs', 'communication_logs_tenant_id_fkey', 'c'),
      ('communication_logs', 'communication_logs_client_id_fkey', 'c'),
      ('marketing_work_items', 'marketing_work_items_pipeline_id_fkey', 'c'),
      ('telegram_messages', 'telegram_messages_client_id_fkey', 'a'),
      ('telegram_messages', 'telegram_messages_lead_id_fkey', 'a'),
      ('automation_executions', 'automation_executions_tenant_id_fkey', 'c'),
      ('integration_health', 'integration_health_tenant_id_fkey', 'c'),
      ('job_queue', 'job_queue_tenant_id_fkey', 'c'),
      ('processed_events', 'processed_events_tenant_id_fkey', 'c'),
      ('tenant_rate_limits', 'tenant_rate_limits_tenant_id_fkey', 'c')
    ) AS t (table_name, object_name, action)
  LOOP
    SELECT c.confdeltype::text INTO v_state
    FROM pg_constraint AS c
    WHERE c.conrelid = to_regclass(format('public.%I', k.table_name)) AND c.conname = k.object_name;
    IF v_state IS DISTINCT FROM k.action THEN
      RAISE EXCEPTION 'on delete: % has action %, expected %', k.object_name, v_state, k.action;
    END IF;
  END LOOP;

  -- The client keys whose orphans the migration archived and removed or cleared are validated.
  SELECT string_agg(c.conname, ', ') INTO v_constraint
  FROM pg_constraint AS c
  WHERE c.conname IN ('communication_logs_client_id_fkey', 'seo_monthly_updates_client_id_fkey',
                      'ahrefs_reports_client_id_fkey', 'maskyoo_numbers_client_id_fkey')
    AND NOT c.convalidated;
  IF v_constraint IS NOT NULL THEN
    RAISE EXCEPTION 'validated: % is still NOT VALID', v_constraint;
  END IF;

  -- The archive exists and is closed to the API roles.
  IF to_regclass('archive.orphan_rows') IS NULL THEN
    RAISE EXCEPTION 'archive: archive.orphan_rows is missing';
  END IF;
  IF has_schema_privilege('anon', 'archive', 'USAGE') OR has_schema_privilege('authenticated', 'archive', 'USAGE')
     OR has_table_privilege('anon', 'archive.orphan_rows', 'SELECT')
     OR has_table_privilege('authenticated', 'archive.orphan_rows', 'SELECT') THEN
    RAISE EXCEPTION 'archive: anon or authenticated can reach archive.orphan_rows';
  END IF;

  -- Archive closure: every row the migration archived is gone if it was deleted, still there if
  -- only its client_id was cleared, and its archived client_id names no client. (The archive step
  -- itself cannot run here, because the keys are valid; the scratch simulation in the PR covers it.)
  SELECT count(*) INTO v_count
  FROM archive.orphan_rows AS a
  WHERE a.reason LIKE '%by 20261103110000'
    AND (
      EXISTS (SELECT 1 FROM public.clients AS c WHERE c.id = (a.row ->> 'client_id')::uuid)
      OR (a.reason LIKE '%row deleted%' AND (
        (a.source_table = 'communication_logs' AND EXISTS (SELECT 1 FROM public.communication_logs AS t WHERE t.id = a.row_id))
        OR (a.source_table = 'seo_monthly_updates' AND EXISTS (SELECT 1 FROM public.seo_monthly_updates AS t WHERE t.id = a.row_id))))
      OR (a.reason LIKE '%client_id cleared%' AND NOT (
        (a.source_table = 'ahrefs_reports' AND EXISTS (SELECT 1 FROM public.ahrefs_reports AS t WHERE t.id = a.row_id))
        OR (a.source_table = 'maskyoo_numbers' AND EXISTS (SELECT 1 FROM public.maskyoo_numbers AS t WHERE t.id = a.row_id))))
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'archive: % archived rows do not match what the migration did to them', v_count;
  END IF;

  -- Fixture: one tenant with an agency, a client, two agents and a user.
  INSERT INTO auth.users (id, email) VALUES (v_user, 'qa-constraints-' || v_tag || '@example.invalid');
  INSERT INTO public.tenants (id, name, slug) VALUES (v_tenant, 'QA constraints ' || v_tag, 'qa-constraints-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES (v_client, v_tenant, v_agency, 'QA client'), (v_client_b, v_tenant, v_agency, 'QA client B');
  INSERT INTO public.ai_agents (id, tenant_id, name) VALUES (v_agent, v_tenant, 'QA agent'), (v_agent_b, v_tenant, 'QA agent B');
  SELECT (enum_range(NULL::public.seo_monthly_status))[1]::text INTO v_status;

  -- The same rows with real parents are accepted, so each refusal below comes from its own key.
  INSERT INTO public.invoice_uploads (tenant_id, file_path, agency_id, client_id) VALUES (v_tenant, 'qa/ok.pdf', v_agency, v_client);
  INSERT INTO public.communication_logs (id, tenant_id, client_id, updated_by) VALUES (v_log, v_tenant, v_client, v_user);
  INSERT INTO public.communication_logs (tenant_id, client_id) VALUES (v_tenant, v_client_b);
  -- A log of the tenant on another tenant's client, as with a shared agency.
  INSERT INTO public.tenants (id, name, slug) VALUES (v_other_tenant, 'QA constraints other ' || v_tag, 'qa-constraints-other-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_other_agency, v_other_tenant, 'QA other agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name) VALUES (v_other_client, v_other_tenant, v_other_agency, 'QA other client');
  INSERT INTO public.communication_logs (tenant_id, client_id) VALUES (v_tenant, v_other_client);
  INSERT INTO public.goals (tenant_id, title) VALUES (v_tenant, 'QA goal');
  INSERT INTO public.agent_supervisors (tenant_id, supervisor_agent_id, child_agent_id) VALUES (v_tenant, v_agent, v_agent_b);
  INSERT INTO public.maskyoo_numbers (tenant_id, phone_last9, display_number) VALUES (v_tenant, '000000000', 'QA');
  INSERT INTO public.agent_action_log (tenant_id, action_type, agent_id) VALUES (v_tenant, 'qa', v_agent_b);
  INSERT INTO public.agent_approval_queue (tenant_id, action_type, title, agent_id) VALUES (v_tenant, 'qa', 'QA approval', v_agent_b);
  INSERT INTO public.seo_monthly_updates (id, tenant_id, client_id, month, status, updated_by)
  VALUES (v_seo, v_tenant, v_client, date '2026-10-01', v_status::public.seo_monthly_status, v_user);
  INSERT INTO public.ai_conversations (id, tenant_id, user_id) VALUES (v_conversation, v_tenant, v_user);
  INSERT INTO public.carmen_whatsapp_sessions (id, tenant_id, chat_id, ai_conversation_id) VALUES (v_session, v_tenant, 'qa-' || v_tag, v_conversation);
  INSERT INTO public.marketing_pipelines (id, tenant_id, client_id, track, name) VALUES (v_pipeline, v_tenant, v_client, 'campaigns', 'QA pipeline');
  INSERT INTO public.marketing_work_items (id, tenant_id, pipeline_id) VALUES (v_item, v_tenant, v_pipeline);
  INSERT INTO public.automation_executions (tenant_id, execution_id, automation_id) VALUES (v_tenant, 'qa-' || v_tag, v_missing);
  INSERT INTO public.integration_health (tenant_id, provider) VALUES (v_tenant, 'qa-' || v_tag);
  INSERT INTO public.job_queue (tenant_id, idempotency_key) VALUES (v_tenant, 'qa-' || v_tag);
  INSERT INTO public.processed_events (tenant_id, event_key) VALUES (v_tenant, 'qa-' || v_tag);

  -- check_rate_limit(uuid, text, integer) inserts ON CONFLICT (tenant_id, resource_type): without
  -- unique_tenant_resource it fails with 42P10.
  IF NOT public.check_rate_limit(v_tenant, 'qa-' || v_tag, 300)
     OR NOT public.check_rate_limit(v_tenant, 'qa-' || v_tag, 300) THEN
    RAISE EXCEPTION 'check_rate_limit refused the first two calls';
  END IF;

  -- $1 tenant, $2 agency, $3 client, $4 agent, $5 a uuid no row has, $6 a seo_monthly_status value, $7 a unique text.
  FOR k IN
    SELECT * FROM (VALUES
      -- Foreign keys: a parent that does not exist.
      ('23503', 'invoice_uploads_tenant_id_fkey', 'insert into public.invoice_uploads (tenant_id, file_path) values ($5, ''qa/x.pdf'')'),
      ('23503', 'invoice_uploads_agency_id_fkey', 'insert into public.invoice_uploads (tenant_id, file_path, agency_id) values ($1, ''qa/x.pdf'', $5)'),
      ('23503', 'invoice_uploads_client_id_fkey', 'insert into public.invoice_uploads (tenant_id, file_path, client_id) values ($1, ''qa/x.pdf'', $5)'),
      ('23503', 'invoice_uploads_supplier_id_fkey', 'insert into public.invoice_uploads (tenant_id, file_path, supplier_id) values ($1, ''qa/x.pdf'', $5)'),
      ('23503', 'invoice_uploads_finance_id_fkey', 'insert into public.invoice_uploads (tenant_id, file_path, finance_id) values ($1, ''qa/x.pdf'', $5)'),
      ('23503', 'communication_logs_client_id_fkey', 'insert into public.communication_logs (tenant_id, client_id) values ($1, $5)'),
      ('23503', 'communication_logs_tenant_id_fkey', 'insert into public.communication_logs (tenant_id, client_id) values ($5, $3)'),
      ('23503', 'seo_monthly_updates_client_id_fkey', 'insert into public.seo_monthly_updates (tenant_id, client_id, month, status) values ($1, $5, date ''2026-11-01'', $6::public.seo_monthly_status)'),
      ('23503', 'seo_monthly_updates_updated_by_fkey', 'insert into public.seo_monthly_updates (tenant_id, client_id, month, status, updated_by) values ($1, $3, date ''2026-11-01'', $6::public.seo_monthly_status, $5)'),
      ('23503', 'marketing_work_items_pipeline_id_fkey', 'insert into public.marketing_work_items (tenant_id, pipeline_id) values ($1, $5)'),
      ('23503', 'telegram_messages_tenant_id_fkey', 'insert into public.telegram_messages (tenant_id, chat_id) values ($5, 1)'),
      ('23503', 'telegram_messages_lead_id_fkey', 'insert into public.telegram_messages (tenant_id, chat_id, lead_id) values ($1, 1, $5)'),
      ('23503', 'telegram_messages_client_id_fkey', 'insert into public.telegram_messages (tenant_id, chat_id, client_id) values ($1, 1, $5)'),
      ('23503', 'telegram_bot_state_shared_from_state_id_fkey', 'insert into public.telegram_bot_state (tenant_id, shared_from_state_id) values ($1, $5)'),
      ('23503', 'goals_parent_goal_id_fkey', 'insert into public.goals (tenant_id, title, parent_goal_id) values ($1, ''QA'', $5)'),
      ('23503', 'agent_action_log_agent_id_fkey', 'insert into public.agent_action_log (tenant_id, action_type, agent_id) values ($1, ''qa'', $5)'),
      ('23503', 'agent_action_log_tenant_id_fkey', 'insert into public.agent_action_log (tenant_id, action_type) values ($5, ''qa'')'),
      ('23503', 'agent_approval_queue_agent_id_fkey', 'insert into public.agent_approval_queue (tenant_id, action_type, title, agent_id) values ($1, ''qa'', ''QA'', $5)'),
      ('23503', 'carmen_whatsapp_sessions_ai_conversation_id_fkey', 'insert into public.carmen_whatsapp_sessions (tenant_id, chat_id, ai_conversation_id) values ($1, ''qa-x-'' || $7, $5)'),
      ('23503', 'agent_runs_parent_run_id_fkey', 'insert into public.agent_runs (tenant_id, agent_id, goal, parent_run_id) values ($1, $4, ''qa'', $5)'),
      ('23503', 'woocommerce_orders_site_id_fkey', 'insert into public.woocommerce_orders (tenant_id, site_id, woo_order_id) values ($1, $5, 1)'),
      ('23503', 'automation_executions_tenant_id_fkey', 'insert into public.automation_executions (tenant_id, execution_id) values ($5, $7)'),
      ('23503', 'integration_health_tenant_id_fkey', 'insert into public.integration_health (tenant_id, provider) values ($5, $7)'),
      ('23503', 'job_queue_tenant_id_fkey', 'insert into public.job_queue (tenant_id) values ($5)'),
      ('23503', 'processed_events_tenant_id_fkey', 'insert into public.processed_events (tenant_id, event_key) values ($5, $7 || ''-x'')'),
      ('23503', 'tenant_rate_limits_tenant_id_fkey', 'insert into public.tenant_rate_limits (tenant_id, resource_type) values ($5, $7)'),
      -- Checks: a value outside each.
      ('23514', 'agent_runs_status_check', 'insert into public.agent_runs (tenant_id, agent_id, goal, status) values ($1, $4, ''qa'', ''qa-bad'')'),
      ('23514', 'campaign_schedules_action_check', 'insert into public.campaign_schedules (tenant_id, entity_id, entity_type, action, run_at) values ($1, ''1'', ''fb_campaign'', ''qa-bad'', now())'),
      ('23514', 'campaign_schedules_entity_type_check', 'insert into public.campaign_schedules (tenant_id, entity_id, entity_type, action, run_at) values ($1, ''1'', ''qa-bad'', ''pause'', now())'),
      ('23514', 'campaign_schedules_when_chk', 'insert into public.campaign_schedules (tenant_id, entity_id, entity_type, action, cron_expression, run_at) values ($1, ''1'', ''fb_campaign'', ''pause'', null, null)'),
      ('23514', 'goals_owner_type_check', 'insert into public.goals (tenant_id, title, owner_type) values ($1, ''QA'', ''qa-bad'')'),
      ('23514', 'marketing_runs_status_check', 'insert into public.marketing_runs (tenant_id, item_id, stage_id, status) values ($1, $5, $5, ''qa-bad'')'),
      ('23514', 'marketing_stage_templates_default_approval_mode_check', 'insert into public.marketing_stage_templates (tenant_id, track, stage_type, name, default_approval_mode) values ($1, ''campaigns'', ''qa'', ''QA'', ''qa-bad'')'),
      ('23514', 'marketing_stage_templates_track_check', 'insert into public.marketing_stage_templates (tenant_id, track, stage_type, name) values ($1, ''qa-bad'', ''qa'', ''QA'')'),
      ('23514', 'marketing_triggers_schedule_preset_check', 'insert into public.marketing_triggers (tenant_id, client_id, pipeline_id, name, schedule_preset) values ($1, $3, $5, ''QA'', ''qa-bad'')'),
      ('23514', 'marketing_triggers_trigger_type_check', 'insert into public.marketing_triggers (tenant_id, client_id, pipeline_id, name, trigger_type) values ($1, $3, $5, ''QA'', ''qa-bad'')'),
      ('23514', 'maskyoo_numbers_category_check', 'insert into public.maskyoo_numbers (tenant_id, phone_last9, display_number, category) values ($1, ''000000001'', ''QA'', ''qa-bad'')'),
      ('23514', 'seo_call_snapshots_category_check', 'insert into public.seo_call_snapshots (tenant_id, client_id, category, period_start, period_end) values ($1, $3, ''qa-bad'', date ''2026-11-01'', date ''2026-11-30'')'),
      ('23514', 'social_publications_post_type_check', 'insert into public.social_publications (tenant_id, platform, post_type) values ($1, ''facebook'', ''qa-bad'')'),
      ('23514', 'social_publications_status_check', 'insert into public.social_publications (tenant_id, platform, post_type, status) values ($1, ''facebook'', ''post'', ''qa-bad'')'),
      ('23514', 'priority_value_range', 'insert into public.tasks (tenant_id, agency_id, title, priority) values ($1, $2, ''QA'', 0)'),
      ('23514', 'telegram_messages_direction_check', 'insert into public.telegram_messages (tenant_id, chat_id, direction) values ($1, 1, ''qa-bad'')'),
      ('23514', 'whatsapp_sessions_status_check', 'insert into public.whatsapp_sessions (tenant_id, chat_id, status) values ($1, ''qa'', ''qa-bad'')'),
      -- Unique keys: a second row with the same key.
      ('23505', 'agent_supervisors_supervisor_agent_id_child_agent_id_key', 'insert into public.agent_supervisors (tenant_id, supervisor_agent_id, child_agent_id) values ($1, $4, (select s.child_agent_id from public.agent_supervisors as s where s.supervisor_agent_id = $4 limit 1))'),
      ('23505', 'maskyoo_numbers_tenant_id_phone_last9_key', 'insert into public.maskyoo_numbers (tenant_id, phone_last9, display_number) values ($1, ''000000000'', ''QA'')'),
      ('23505', 'unique_execution', 'insert into public.automation_executions (tenant_id, execution_id, automation_id) select tenant_id, execution_id, automation_id from public.automation_executions where tenant_id = $1 and execution_id = ''qa-'' || $7'),
      ('23505', 'unique_idempotency_key', 'insert into public.job_queue (tenant_id, idempotency_key) values ($1, ''qa-'' || $7)'),
      ('23505', 'unique_tenant_resource', 'insert into public.tenant_rate_limits (tenant_id, resource_type) values ($1, ''qa-'' || $7)')
    ) AS t (sqlstate, constraint_name, statement)
  LOOP
    BEGIN
      EXECUTE k.statement USING v_tenant, v_agency, v_client, v_agent, v_missing, v_status, v_tag;
      RAISE EXCEPTION 'refused: % accepted a row it must refuse', k.constraint_name
        USING ERRCODE = 'P0001';
    EXCEPTION WHEN foreign_key_violation OR check_violation OR unique_violation THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
      IF v_state <> k.sqlstate OR v_constraint IS DISTINCT FROM k.constraint_name THEN
        RAISE EXCEPTION 'refused: expected % from %, got % from %',
          k.sqlstate, k.constraint_name, v_state, v_constraint;
      END IF;
    END;
  END LOOP;

  -- Deleting an agent keeps its action log and approval rows without the agent (ON DELETE SET NULL).
  DELETE FROM public.ai_agents WHERE id = v_agent_b;
  IF NOT EXISTS (SELECT 1 FROM public.agent_action_log WHERE tenant_id = v_tenant AND action_type = 'qa' AND agent_id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.agent_approval_queue WHERE tenant_id = v_tenant AND title = 'QA approval' AND agent_id IS NULL) THEN
    RAISE EXCEPTION 'agent delete: an action log or approval row is gone or still names the agent';
  END IF;

  -- Deleting a conversation keeps Carmen's session without the link.
  DELETE FROM public.ai_conversations WHERE id = v_conversation;
  IF NOT EXISTS (SELECT 1 FROM public.carmen_whatsapp_sessions WHERE id = v_session AND ai_conversation_id IS NULL) THEN
    RAISE EXCEPTION 'conversation delete: the session is gone or still names the conversation';
  END IF;

  -- Deleting a user keeps the SEO update without the user, and leaves communication_logs.updated_by
  -- alone (no key on that column).
  DELETE FROM auth.users WHERE id = v_user;
  IF NOT EXISTS (SELECT 1 FROM public.seo_monthly_updates WHERE id = v_seo AND updated_by IS NULL) THEN
    RAISE EXCEPTION 'user delete: the SEO update is gone or still names the user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.communication_logs WHERE id = v_log AND updated_by = v_user) THEN
    RAISE EXCEPTION 'user delete: the communication log changed';
  END IF;

  -- Deleting a client removes its communication log but keeps its pipeline and that pipeline's work item.
  DELETE FROM public.clients WHERE id = v_client;
  IF EXISTS (SELECT 1 FROM public.communication_logs WHERE id = v_log) THEN
    RAISE EXCEPTION 'client delete: the communication log is still there';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketing_pipelines WHERE id = v_pipeline AND client_id = v_client)
     OR NOT EXISTS (SELECT 1 FROM public.marketing_work_items WHERE id = v_item AND pipeline_id = v_pipeline) THEN
    RAISE EXCEPTION 'client delete: the pipeline or its work item was removed or changed';
  END IF;

  -- A single DELETE of the tenant, with its clients and communication logs still there, removes
  -- its logs, including the one on the other tenant's client, and the rows behind the new tenant
  -- keys. The other tenant and its client stay.
  DELETE FROM public.tenants WHERE id = v_tenant;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_other_client) THEN
    RAISE EXCEPTION 'tenant delete: the other tenant''s client is gone';
  END IF;
  SELECT (SELECT count(*) FROM public.communication_logs WHERE tenant_id = v_tenant)
       + (SELECT count(*) FROM public.automation_executions WHERE tenant_id = v_tenant)
       + (SELECT count(*) FROM public.integration_health WHERE tenant_id = v_tenant)
       + (SELECT count(*) FROM public.job_queue WHERE tenant_id = v_tenant)
       + (SELECT count(*) FROM public.processed_events WHERE tenant_id = v_tenant)
       + (SELECT count(*) FROM public.tenant_rate_limits WHERE tenant_id = v_tenant)
  INTO v_count;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'tenant delete: % rows of the tenant are left', v_count;
  END IF;
END
$test$;
SELECT 'restore lost constraints: existence, actions, refusals and deletes passed' AS result;
ROLLBACK;
