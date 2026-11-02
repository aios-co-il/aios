-- Carmen command center and goals RLS (20261102102000_restore_carmen_command_rls,
-- 20261102120200_carmen_command_rls_guard): synthetic tenants and personas
-- inside one transaction that is rolled back. Tenant A has an owner and a
-- member; tenant B has a member (the outsider); the super admin acts in tenant
-- B; tenant C is empty; anon has no session. Tenants A and B hold one row in
-- each of the nine tables; the member creates tenant A's heartbeat row.
-- Browser inserts never use RETURNING and are checked as postgres, and
-- inserts into another tenant target tenant C, so the INSERT policy alone
-- decides them (RETURNING or ON CONFLICT onto a stored row would bring in the
-- SELECT or UPDATE policy).
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_empty_tenant uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_agent uuid := gen_random_uuid();
  v_other_agent uuid := gen_random_uuid();
  v_goal uuid := gen_random_uuid();
  v_other_goal uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
  v_other_task uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_other_session uuid := gen_random_uuid();
  v_approval uuid := gen_random_uuid();
  v_new_goal uuid := gen_random_uuid();
  v_new_task uuid := gen_random_uuid();
  v_admin_goal uuid := gen_random_uuid();
  v_tables text[] := ARRAY['goals', 'agent_tasks', 'tenant_heartbeat_settings', 'heartbeat_logs',
    'carmen_whatsapp_sessions', 'integration_alerts_log', 'integration_health',
    'agent_action_log', 'agent_approval_queue'];
  v_table text;
  v_rules jsonb;
  v_total bigint;
  v_own bigint;
  v_other bigint;
  v_rows integer;
  v_message text;
BEGIN
  -- Fixtures, written as postgres.
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-rls-carmen-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_member, v_outsider, v_admin]) AS u;
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_tenant, 'QA tenant A', 'qa-rls-carmen-a-' || v_tag),
    (v_other_tenant, 'QA tenant B', 'qa-rls-carmen-b-' || v_tag),
    (v_empty_tenant, 'QA tenant C', 'qa-rls-carmen-c-' || v_tag);
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_tenant, v_owner, 'owner'), (v_tenant, v_member, 'member'), (v_other_tenant, v_outsider, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_owner, 'owner', v_tenant), (v_member, 'campaigner', v_tenant),
    (v_outsider, 'campaigner', v_other_tenant), (v_admin, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_owner, v_tenant), (v_member, v_tenant), (v_outsider, v_other_tenant), (v_admin, v_other_tenant);

  INSERT INTO public.ai_agents (id, tenant_id, name) VALUES
    (v_agent, v_tenant, 'QA agent A'), (v_other_agent, v_other_tenant, 'QA agent B');
  INSERT INTO public.goals (id, tenant_id, title) VALUES
    (v_goal, v_tenant, 'QA goal A'), (v_other_goal, v_other_tenant, 'QA goal B');
  INSERT INTO public.agent_tasks (id, tenant_id, agent_id, title, goal_id) VALUES
    (v_task, v_tenant, v_agent, 'QA task A', v_goal),
    (v_other_task, v_other_tenant, v_other_agent, 'QA task B', v_other_goal);
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, pulse_alert_rules)
  VALUES (v_other_tenant, '{"cpl_spike_pct": 50, "manager": {"mode": "observe",
    "max_alerts_per_recipient_per_day": 5, "cost": {"trend_pct": 40}}}');
  INSERT INTO public.heartbeat_logs (tenant_id) VALUES (v_tenant), (v_other_tenant);
  INSERT INTO public.carmen_whatsapp_sessions (id, tenant_id, chat_id) VALUES
    (v_session, v_tenant, 'qa-' || v_tag || '@c.us'), (v_other_session, v_other_tenant, 'qa-' || v_tag || '@c.us');
  INSERT INTO public.integration_alerts_log (tenant_id, provider, alert_type)
  VALUES (v_tenant, 'qa', 'qa'), (v_other_tenant, 'qa', 'qa');
  INSERT INTO public.integration_health (tenant_id, provider) VALUES (v_tenant, 'qa'), (v_other_tenant, 'qa');
  INSERT INTO public.agent_action_log (tenant_id, action_type) VALUES (v_tenant, 'qa'), (v_other_tenant, 'qa');
  INSERT INTO public.agent_approval_queue (id, tenant_id, action_type, title) VALUES
    (v_approval, v_tenant, 'qa', 'QA approval A'), (gen_random_uuid(), v_other_tenant, 'qa', 'QA approval B');

  -- The Heartbeat panel upserts on tenant_id, which needs #1010's primary
  -- key; add it inside this rolled-back transaction until that lands.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_heartbeat_settings'::regclass AND contype IN ('p', 'u')
  ) THEN
    ALTER TABLE public.tenant_heartbeat_settings ADD PRIMARY KEY (tenant_id);
  END IF;

  -- Member of tenant A: creates the tenant's heartbeat row the way the tasks
  -- view's first save does (a plain insert).
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, max_concurrent_tasks) VALUES (v_tenant, 3);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'member: the own heartbeat row was not created';
  END IF;
  SET LOCAL ROLE authenticated;

  -- ...reads the Carmen tasks list, goals, heartbeat settings and every other
  -- table of the group for tenant A only.
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*), count(*) FILTER (WHERE tenant_id = $1) FROM public.%I', v_table)
    INTO v_total, v_own USING v_tenant;
    IF v_total <> 1 OR v_own <> 1 THEN
      RAISE EXCEPTION 'member: % shows % rows, % of them in the own tenant (expected 1 and 1)', v_table, v_total, v_own;
    END IF;
  END LOOP;

  -- ...creates, edits and deletes goals and Carmen tasks in tenant A only.
  INSERT INTO public.goals (id, tenant_id, title) VALUES (v_new_goal, v_tenant, 'QA member goal');
  INSERT INTO public.agent_tasks (id, tenant_id, agent_id, title, goal_id)
  VALUES (v_new_task, v_tenant, v_agent, 'QA member task', v_new_goal);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.goals WHERE id = v_new_goal AND tenant_id = v_tenant)
     OR NOT EXISTS (SELECT 1 FROM public.agent_tasks WHERE id = v_new_task AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'member: the own goal or task was not created';
  END IF;
  SET LOCAL ROLE authenticated;
  UPDATE public.goals SET status = 'in_progress' WHERE id IN (v_goal, v_other_goal);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: goal edit reached % rows (expected own only)', v_rows; END IF;
  UPDATE public.agent_tasks SET status = 'running' WHERE id IN (v_task, v_other_task);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: task edit reached % rows (expected own only)', v_rows; END IF;
  DELETE FROM public.agent_tasks WHERE id IN (v_new_task, v_other_task);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: task delete reached % rows (expected own only)', v_rows; END IF;
  DELETE FROM public.goals WHERE id IN (v_new_goal, v_other_goal);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: goal delete reached % rows (expected own only)', v_rows; END IF;
  BEGIN
    INSERT INTO public.goals (tenant_id, title) VALUES (v_empty_tenant, 'Must be denied');
    RAISE EXCEPTION 'member: a goal can be created in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agent_tasks (tenant_id, agent_id, title) VALUES (v_empty_tenant, v_agent, 'Must be denied');
    RAISE EXCEPTION 'member: a task can be created in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.agent_tasks SET tenant_id = v_other_tenant WHERE id = v_task;
    RAISE EXCEPTION 'member: a task can be moved to another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- ...pauses a Carmen session of tenant A only.
  UPDATE public.carmen_whatsapp_sessions SET open_group = true WHERE id IN (v_session, v_other_session);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: session edit reached % rows (expected own only)', v_rows; END IF;

  -- ...saves heartbeat settings and the cost thresholds the way the panel
  -- does (upsert on tenant_id) and the way the tasks view does (update).
  SELECT pulse_alert_rules INTO v_rules FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant;
  v_rules := v_rules || '{"manager": {"cost": {"trend_pct": 55}}}';
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, enabled, interval_hours, pulse_alert_rules, updated_at)
  VALUES (v_tenant, true, 6, v_rules, now())
  ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, interval_hours = EXCLUDED.interval_hours,
    pulse_alert_rules = EXCLUDED.pulse_alert_rules, updated_at = EXCLUDED.updated_at;
  UPDATE public.tenant_heartbeat_settings SET max_concurrent_tasks = 4 WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'member: the tasks view could not save max_concurrent_tasks'; END IF;
  IF (SELECT pulse_alert_rules #>> '{manager,cost,trend_pct}' FROM public.tenant_heartbeat_settings
      WHERE tenant_id = v_tenant) IS DISTINCT FROM '55' THEN
    RAISE EXCEPTION 'member: the cost thresholds were not saved';
  END IF;

  -- ...but the trigger refuses the owner-only manager settings, by upsert or update.
  SELECT pulse_alert_rules INTO v_rules FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant;
  BEGIN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id, pulse_alert_rules)
    VALUES (v_tenant, jsonb_set(v_rules, '{manager,max_alerts_per_recipient_per_day}', '501'))
    ON CONFLICT (tenant_id) DO UPDATE SET pulse_alert_rules = EXCLUDED.pulse_alert_rules;
    RAISE EXCEPTION 'Expected rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'carmen_manager_settings_owner_only' THEN
      RAISE EXCEPTION 'member: an upsert changed the owner-only manager settings (%)', v_message;
    END IF;
  END;
  BEGIN
    UPDATE public.tenant_heartbeat_settings
    SET pulse_alert_rules = jsonb_set(pulse_alert_rules, '{manager,mode}', '"david_only"')
    WHERE tenant_id = v_tenant;
    RAISE EXCEPTION 'Expected rejection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'carmen_manager_settings_owner_only' THEN
      RAISE EXCEPTION 'member: an update changed the owner-only manager settings (%)', v_message;
    END IF;
  END;

  -- ...cannot create or edit another tenant's heartbeat settings.
  BEGIN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id, enabled) VALUES (v_empty_tenant, true);
    RAISE EXCEPTION 'member: another tenant''s heartbeat settings can be created';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.tenant_heartbeat_settings SET enabled = true WHERE tenant_id = v_other_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'member: another tenant''s heartbeat settings are editable'; END IF;

  -- ...and writes none of the logs or the approval queue (approvals are
  -- decided by carmen-approval-execute and resume-agent-run, AIO-230).
  BEGIN
    INSERT INTO public.agent_action_log (tenant_id, action_type) VALUES (v_tenant, 'Must be denied');
    RAISE EXCEPTION 'member: agent_action_log accepts a browser insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.heartbeat_logs (tenant_id) VALUES (v_tenant);
    RAISE EXCEPTION 'member: heartbeat_logs accepts a browser insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.integration_health (tenant_id, provider) VALUES (v_tenant, 'Must be denied');
    RAISE EXCEPTION 'member: integration_health accepts a browser insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agent_approval_queue (tenant_id, action_type, title) VALUES (v_tenant, 'qa', 'Must be denied');
    RAISE EXCEPTION 'member: agent_approval_queue accepts a browser insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.agent_approval_queue SET status = 'approved' WHERE id = v_approval;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'member: an approval can be decided from the browser'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Owner of tenant A: reads tenant A only and saves everything, the
  -- owner-only manager settings included.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*), count(*) FILTER (WHERE tenant_id = $1) FROM public.%I', v_table)
    INTO v_total, v_own USING v_tenant;
    IF v_total <> 1 OR v_own <> 1 THEN
      RAISE EXCEPTION 'owner: % shows % rows, % of them in the own tenant (expected 1 and 1)', v_table, v_total, v_own;
    END IF;
  END LOOP;
  SELECT pulse_alert_rules INTO v_rules FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant;
  v_rules := v_rules || jsonb_build_object('manager', v_rules -> 'manager'
    || '{"mode": "david_only", "max_alerts_per_recipient_per_day": 7, "cost": {"trend_pct": 60}}');
  INSERT INTO public.tenant_heartbeat_settings (tenant_id, enabled, interval_hours, pulse_alert_rules, updated_at)
  VALUES (v_tenant, false, 4, v_rules, now())
  ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, interval_hours = EXCLUDED.interval_hours,
    pulse_alert_rules = EXCLUDED.pulse_alert_rules, updated_at = EXCLUDED.updated_at;
  SELECT pulse_alert_rules INTO v_rules FROM public.tenant_heartbeat_settings WHERE tenant_id = v_tenant;
  IF v_rules #>> '{manager,max_alerts_per_recipient_per_day}' IS DISTINCT FROM '7'
     OR v_rules #>> '{manager,mode}' IS DISTINCT FROM 'david_only'
     OR v_rules #>> '{manager,cost,trend_pct}' IS DISTINCT FROM '60' THEN
    RAISE EXCEPTION 'owner: the manager settings were not saved (%)', v_rules -> 'manager';
  END IF;
  UPDATE public.goals SET status = 'paused' WHERE id = v_goal;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'owner: the own goal is not editable'; END IF;
  RESET ROLE;

  -- Member of tenant B: sees nothing of tenant A and cannot touch it.
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE tenant_id = $1), count(*) FILTER (WHERE tenant_id = $2) FROM public.%I', v_table)
    INTO v_own, v_other USING v_other_tenant, v_tenant;
    IF v_own <> 1 OR v_other <> 0 THEN
      RAISE EXCEPTION 'outsider: % shows % own and % tenant A rows (expected 1 and 0)', v_table, v_own, v_other;
    END IF;
  END LOOP;
  UPDATE public.tenant_heartbeat_settings SET enabled = true WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'outsider: tenant A''s heartbeat settings are editable'; END IF;
  UPDATE public.goals SET title = 'Must be denied' WHERE id = v_goal;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'outsider: tenant A''s goal is editable'; END IF;
  DELETE FROM public.agent_tasks WHERE id = v_task;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'outsider: tenant A''s task is deletable'; END IF;
  RESET ROLE;

  -- Super admin acting in tenant B: reads every tenant, writes in tenant B,
  -- and is refused every write into another tenant.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FILTER (WHERE tenant_id = $1), count(*) FILTER (WHERE tenant_id = $2) FROM public.%I', v_table)
    INTO v_own, v_other USING v_other_tenant, v_tenant;
    IF v_own <> 1 OR v_other <> 1 THEN
      RAISE EXCEPTION 'super admin: % shows % tenant B and % tenant A rows (expected 1 and 1)', v_table, v_own, v_other;
    END IF;
  END LOOP;

  INSERT INTO public.goals (id, tenant_id, title) VALUES (v_admin_goal, v_other_tenant, 'QA admin goal');
  UPDATE public.agent_tasks SET status = 'paused' WHERE id = v_other_task;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'super admin: the acting tenant''s task is not editable'; END IF;
  UPDATE public.carmen_whatsapp_sessions SET open_group = true WHERE id = v_other_session;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'super admin: the acting tenant''s session is not editable'; END IF;
  UPDATE public.tenant_heartbeat_settings
  SET pulse_alert_rules = jsonb_set(pulse_alert_rules, '{manager,max_alerts_per_recipient_per_day}', '8')
  WHERE tenant_id = v_other_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'super admin: the acting tenant''s manager settings are not editable'; END IF;

  BEGIN
    INSERT INTO public.goals (tenant_id, title) VALUES (v_tenant, 'Must be denied');
    RAISE EXCEPTION 'super admin: a goal can be created in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.goals SET title = 'Must be denied' WHERE id = v_goal;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: another tenant''s goal is editable'; END IF;
  BEGIN
    UPDATE public.goals SET tenant_id = v_tenant WHERE id = v_other_goal;
    RAISE EXCEPTION 'super admin: a goal can be moved to another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.goals WHERE id = v_goal;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: another tenant''s goal is deletable'; END IF;
  BEGIN
    INSERT INTO public.agent_tasks (tenant_id, agent_id, title) VALUES (v_tenant, v_agent, 'Must be denied');
    RAISE EXCEPTION 'super admin: a task can be created in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.agent_tasks SET status = 'failed' WHERE id = v_task;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: another tenant''s task is editable'; END IF;
  DELETE FROM public.agent_tasks WHERE id = v_task;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: another tenant''s task is deletable'; END IF;
  UPDATE public.carmen_whatsapp_sessions SET status = 'paused' WHERE id = v_session;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: another tenant''s session is editable'; END IF;
  UPDATE public.tenant_heartbeat_settings SET enabled = true WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'super admin: another tenant''s heartbeat settings are editable'; END IF;
  BEGIN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id, enabled) VALUES (v_empty_tenant, true);
    RAISE EXCEPTION 'super admin: another tenant''s heartbeat settings can be created';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.goals WHERE id = v_admin_goal AND tenant_id = v_other_tenant) THEN
    RAISE EXCEPTION 'super admin: the goal in the acting tenant was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.goals WHERE id = v_goal AND title = 'QA goal A')
     OR NOT EXISTS (SELECT 1 FROM public.agent_tasks WHERE id = v_task AND status = 'running')
     OR NOT EXISTS (SELECT 1 FROM public.carmen_whatsapp_sessions WHERE id = v_session AND status = 'active') THEN
    RAISE EXCEPTION 'super admin: a tenant A row changed';
  END IF;

  -- anon: reads nothing and writes nothing (the approval queue is not even granted).
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_total;
      IF v_total <> 0 THEN RAISE EXCEPTION 'anon: % shows % rows', v_table, v_total; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    INSERT INTO public.goals (tenant_id, title) VALUES (v_tenant, 'Must be denied');
    RAISE EXCEPTION 'anon: a goal can be created';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.tenant_heartbeat_settings (tenant_id, enabled) VALUES (v_empty_tenant, true);
    RAISE EXCEPTION 'anon: heartbeat settings can be created';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'restore_carmen_command_rls: all checks passed';
END;
$test$;
SELECT 'Carmen command RLS: member, owner, other tenant, super admin and anon checks passed' AS result;
ROLLBACK;
