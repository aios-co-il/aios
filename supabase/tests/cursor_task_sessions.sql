-- Cursor task sessions (20261031120000_cursor_task_sessions): synthetic rows
-- inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_other_tenant uuid;
  v_staff uuid;
  v_other_staff uuid;
  v_rows integer;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_other_tenant FROM public.tenants WHERE id <> v_tenant ORDER BY id LIMIT 1;
  IF v_tenant IS NULL OR v_other_tenant IS NULL THEN
    RAISE EXCEPTION 'Requires two tenants';
  END IF;

  -- The tracker's upsert (service role): one row per org and agent id.
  INSERT INTO public.cursor_task_sessions (tenant_id, cursor_agent_id, display_name, source_tool)
  VALUES (v_tenant, 'bc-qa-rollback', 'QA ROLLBACK', 'request_dev_task')
  ON CONFLICT (tenant_id, cursor_agent_id) DO UPDATE SET status = 'busy';
  INSERT INTO public.cursor_task_sessions (tenant_id, cursor_agent_id, display_name, source_tool)
  VALUES (v_tenant, 'bc-qa-rollback', 'QA ROLLBACK', 'request_dev_task')
  ON CONFLICT (tenant_id, cursor_agent_id) DO UPDATE SET status = 'busy';
  SELECT count(*) INTO v_rows FROM public.cursor_task_sessions
  WHERE tenant_id = v_tenant AND cursor_agent_id = 'bc-qa-rollback' AND status = 'busy';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'upsert: expected one busy row, got %', v_rows; END IF;

  -- The same agent id in another org is that org's own row, never a move.
  INSERT INTO public.cursor_task_sessions (tenant_id, cursor_agent_id, display_name, source_tool)
  VALUES (v_other_tenant, 'bc-qa-rollback', 'QA ROLLBACK other', 'ask_cursor')
  ON CONFLICT (tenant_id, cursor_agent_id) DO UPDATE SET status = 'busy';
  SELECT count(*) INTO v_rows FROM public.cursor_task_sessions
  WHERE cursor_agent_id = 'bc-qa-rollback';
  IF v_rows <> 2 THEN RAISE EXCEPTION 'tenant key: expected a row per org, got %', v_rows; END IF;

  BEGIN
    INSERT INTO public.cursor_task_sessions (tenant_id, cursor_agent_id, display_name, source_tool, status)
    VALUES (v_tenant, 'bc-qa-bad-status', 'QA', 'ask_cursor', 'paused');
    RAISE EXCEPTION 'status: an unknown status must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- cursor-mcp logs a reply into an open session.
  INSERT INTO public.cursor_dispatches (tenant_id, tool, request_text)
  VALUES (v_tenant, 'reply_to_cursor_session', 'QA ROLLBACK reply');

  -- The tracker stamps and clears the task's session.
  PERFORM cursor_session_id, cursor_session_url FROM public.tasks LIMIT 1;

  -- Staff of each org (synthetic roles).
  SELECT p.id INTO v_staff FROM public.profiles p
  WHERE NOT public.is_super_admin(p.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.tenant_id = v_other_tenant)
  ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_other_staff FROM public.profiles p
  WHERE NOT public.is_super_admin(p.id)
    AND p.id <> v_staff
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.tenant_id = v_tenant)
  ORDER BY p.id LIMIT 1;
  IF v_staff IS NULL OR v_other_staff IS NULL THEN
    RAISE EXCEPTION 'Requires two profiles that are not super admins';
  END IF;
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES
    (v_staff, v_tenant, 'team_manager'),
    (v_other_staff, v_other_tenant, 'team_manager')
  ON CONFLICT ON CONSTRAINT user_roles_user_id_role_tenant_unique DO NOTHING;

  -- Staff of the org read its sessions and cannot write one.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_staff)::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.cursor_task_sessions
  WHERE tenant_id = v_tenant AND cursor_agent_id = 'bc-qa-rollback';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'rls: staff must read their org''s session'; END IF;
  BEGIN
    INSERT INTO public.cursor_task_sessions (tenant_id, cursor_agent_id, display_name, source_tool)
    VALUES (v_tenant, 'bc-qa-staff', 'QA staff', 'ask_cursor');
    RAISE EXCEPTION 'grants: staff must not write a session';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Staff of another org read nothing of this org.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_other_staff)::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.cursor_task_sessions WHERE tenant_id = v_tenant;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'rls: another org must read no session, got %', v_rows; END IF;
  RESET ROLE;

  -- Signed out, nothing is readable.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.cursor_task_sessions LIMIT 1;
    RAISE EXCEPTION 'grants: anon must not read sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END
$test$;
SELECT 'Cursor task sessions: tenant key, status, dispatch tool, task columns, grants and RLS passed' AS result;
ROLLBACK;
