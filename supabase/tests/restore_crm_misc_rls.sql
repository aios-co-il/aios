-- CRM, tasks, time, leads and tenant admin access rules
-- (20261102108000_restore_crm_misc_rls): who reads and writes
-- communication_logs, task_collaborators, time_entry_breaks,
-- lead_sales_people, calendar_shares, user_workspace_layout,
-- tenant_templates, terminology_presets, automation_shared_tenants,
-- automation_executions and error_logs. Staging only: the test's own tenants
-- and rows, existing non-admin users as personas, and a full rollback.
BEGIN;

-- Acts as p_user (auth.uid()) with database role p_role; 'none' returns to the session user.
CREATE FUNCTION pg_temp.qa_act(p_user uuid, p_role text DEFAULT 'authenticated') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  PERFORM set_config('role', p_role, true);
END;
$$;

-- Fails the test when a persona sees or changes the wrong number of rows.
CREATE FUNCTION pg_temp.qa_expect(p_actual bigint, p_expected bigint, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION '%: expected %, got %', p_what, p_expected, p_actual;
  END IF;
END;
$$;

DO $test$
DECLARE
  v_users uuid[];
  u_owner uuid; u_camp_a uuid; u_camp_b uuid; u_sales uuid; u_other uuid; u_admin uuid;
  t_a uuid; t_b uuid; v_tenants uuid[];
  ag_a uuid; ag_b uuid; cl_1 uuid; cl_2 uuid; cl_b uuid;
  cp_a uuid; cp_b uuid; cp_x uuid; sp_1 uuid; sp_2 uuid;
  task_1 uuid; task_2 uuid; entry_a uuid; entry_b uuid; lead_1 uuid; lead_2 uuid; au_a uuid;
  tpl_a uuid; tpl_b uuid; tpl_pub uuid; pr_pub uuid; pr_camp uuid; pr_owner uuid;
  n bigint;
BEGIN
  -- user_roles and tenant_users need auth.users rows, so the personas are
  -- existing non-admin users. Each acts only through the memberships and
  -- roles it gets in this test's new tenants (its active tenant is set below).
  SELECT array_agg(id ORDER BY id) INTO v_users FROM (
    SELECT u.id FROM auth.users u WHERE NOT public.is_super_admin(u.id) ORDER BY u.id LIMIT 6
  ) AS picked;
  IF coalesce(array_length(v_users, 1), 0) < 6 THEN
    RAISE EXCEPTION 'Requires six non-admin users';
  END IF;
  u_owner := v_users[1]; u_camp_a := v_users[2]; u_camp_b := v_users[3];
  u_sales := v_users[4]; u_other := v_users[5]; u_admin := v_users[6];

  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK A', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  v_tenants := array[t_a, t_b];
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK A', t_a) RETURNING id INTO ag_a;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK B', t_b) RETURNING id INTO ag_b;
  INSERT INTO public.clients (name, tenant_id, agency_id) VALUES ('QA ROLLBACK 1', t_a, ag_a) RETURNING id INTO cl_1;
  INSERT INTO public.clients (name, tenant_id, agency_id) VALUES ('QA ROLLBACK 2', t_a, ag_a) RETURNING id INTO cl_2;
  INSERT INTO public.clients (name, tenant_id, agency_id) VALUES ('QA ROLLBACK B', t_b, ag_b) RETURNING id INTO cl_b;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK A', t_a) RETURNING id INTO cp_a;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK B', t_a) RETURNING id INTO cp_b;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK X', t_a) RETURNING id INTO cp_x;
  INSERT INTO public.sales_people (full_name, agency_id, tenant_id) VALUES ('QA ROLLBACK 1', ag_a, t_a) RETURNING id INTO sp_1;
  INSERT INTO public.sales_people (full_name, agency_id, tenant_id) VALUES ('QA ROLLBACK 2', ag_a, t_a) RETURNING id INTO sp_2;

  -- Owner of t_a; campaigner A on client 1 only; campaigner B on client 2 only;
  -- a sales person; the owner of t_b; and a super admin in neither tenant.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (u_owner, t_a, 'owner'), (u_camp_a, t_a, 'member'), (u_camp_b, t_a, 'member'),
    (u_sales, t_a, 'member'), (u_other, t_b, 'owner');
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (u_owner, t_a), (u_camp_a, t_a), (u_camp_b, t_a), (u_sales, t_a), (u_other, t_b)
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = excluded.tenant_id;
  UPDATE public.profiles SET campaigner_id = cp_a, sales_person_id = NULL WHERE id = u_camp_a;
  UPDATE public.profiles SET campaigner_id = cp_b, sales_person_id = NULL WHERE id = u_camp_b;
  UPDATE public.profiles SET sales_person_id = sp_1, campaigner_id = NULL WHERE id = u_sales;
  -- camp_b also holds a super_admin role scoped to t_a, which is not a super admin.
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (u_owner, 'owner', t_a), (u_camp_a, 'campaigner', t_a), (u_camp_b, 'campaigner', t_a),
    (u_camp_b, 'super_admin', t_a), (u_sales, 'sales_person', t_a), (u_other, 'owner', t_b),
    (u_admin, 'super_admin', NULL)
  ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (cl_1, cp_a), (cl_2, cp_b);

  INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES
    (t_a, cl_1, 'normal'), (t_a, cl_2, 'normal'), (t_b, cl_b, 'normal');
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id) VALUES ('QA ROLLBACK 1', t_a, ag_a, cp_a) RETURNING id INTO task_1;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id) VALUES ('QA ROLLBACK 2', t_a, ag_a, cp_b) RETURNING id INTO task_2;
  INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES (task_1, cp_b, t_a), (task_2, cp_a, t_a);
  INSERT INTO public.time_entries (campaigner_id, start_time, tenant_id) VALUES (cp_a, now(), t_a) RETURNING id INTO entry_a;
  INSERT INTO public.time_entries (campaigner_id, start_time, tenant_id) VALUES (cp_a, now(), t_b) RETURNING id INTO entry_b;
  INSERT INTO public.time_entry_breaks (time_entry_id, tenant_id) VALUES (entry_a, t_a), (entry_b, t_b);
  INSERT INTO public.leads (company_name, tenant_id, agency_id) VALUES ('QA ROLLBACK', t_a, ag_a) RETURNING id INTO lead_1;
  INSERT INTO public.leads (company_name, tenant_id, agency_id) VALUES ('QA ROLLBACK 2', t_a, ag_a) RETURNING id INTO lead_2;
  INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_1, sp_1, t_a), (lead_1, sp_2, t_a);
  INSERT INTO public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id, permission_level) VALUES (u_owner, u_camp_a, t_a, 'view');
  INSERT INTO public.user_workspace_layout (user_id, tenant_id, module_id) VALUES (u_owner, t_a, 'qa'), (u_camp_a, t_a, 'qa');
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by, is_public) VALUES (t_a, 'QA ROLLBACK A', u_owner, false) RETURNING id INTO tpl_a;
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by, is_public) VALUES (t_b, 'QA ROLLBACK B', u_other, false) RETURNING id INTO tpl_b;
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by, is_public) VALUES (t_b, 'QA ROLLBACK public', u_other, true) RETURNING id INTO tpl_pub;
  INSERT INTO public.terminology_presets (name, terms, is_public, created_by_user_id) VALUES ('QA ROLLBACK public', '[]', true, u_other) RETURNING id INTO pr_pub;
  INSERT INTO public.terminology_presets (name, terms, is_public, created_by_user_id) VALUES ('QA ROLLBACK camp', '[]', false, u_camp_a) RETURNING id INTO pr_camp;
  INSERT INTO public.terminology_presets (name, terms, is_public, created_by_user_id) VALUES ('QA ROLLBACK owner', '[]', false, u_owner) RETURNING id INTO pr_owner;
  INSERT INTO public.automations (name, tenant_id, trigger_type, action_type, configuration)
  VALUES ('QA ROLLBACK', t_a, 'task_assigned', 'webhook', '{}') RETURNING id INTO au_a;
  INSERT INTO public.automation_shared_tenants (automation_id, tenant_id) VALUES (au_a, t_b);
  INSERT INTO public.automation_executions (execution_id, tenant_id, automation_id) VALUES ('qa-a', t_a, au_a), ('qa-b', t_b, NULL);
  INSERT INTO public.error_logs (tenant_id, source, error_message) VALUES (t_a, 'qa', 'QA ROLLBACK');

  -- Owner of t_a: every client's log, every task's collaborators, every assignment.
  PERFORM pg_temp.qa_act(u_owner);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants)), 2, 'owner reads t_a client logs');
  INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_a, cl_2, 'happy');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2)), 2, 'owner reads both tasks'' collaborators');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id = lead_1), 2, 'owner reads the lead''s assignments');
  DELETE FROM public.lead_sales_people WHERE lead_id = lead_1 AND sales_person_id = sp_2;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner removes an assignment');
  INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_1, sp_2, t_a)
  ON CONFLICT (lead_id, sales_person_id) DO NOTHING;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a breaks');
  UPDATE public.calendar_shares SET permission_level = 'full' WHERE owner_user_id = u_owner AND tenant_id = t_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner edits own calendar share');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id IN (tpl_a, tpl_b, tpl_pub)), 2, 'owner reads own and public templates');
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by) VALUES (t_a, 'QA ROLLBACK A2', u_owner);
  UPDATE public.tenant_templates SET name = 'Must be denied' WHERE id = tpl_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'owner edits another tenant''s template');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id = au_a), 1, 'owner reads the automation share');
  DELETE FROM public.automation_shared_tenants WHERE automation_id = au_a AND tenant_id = t_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'owner stops the automation share');
  INSERT INTO public.automation_shared_tenants (automation_id, tenant_id, shared_by) VALUES (au_a, t_b, u_owner);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a automation runs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.error_logs WHERE tenant_id = ANY (v_tenants)), 0, 'owner reads error logs (super admin only)');
  BEGIN
    INSERT INTO public.error_logs (tenant_id, source, error_message) VALUES (t_a, 'qa', 'Must be denied');
    RAISE EXCEPTION 'owner wrote an error log (service role only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.automation_executions (execution_id, tenant_id) VALUES ('Must be denied', t_a);
    RAISE EXCEPTION 'owner wrote an automation run (service role only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Campaigner A: client 1 only, task 1 only.
  PERFORM pg_temp.qa_act(u_camp_a);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_1), 1, 'campaigner A reads client 1 logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_2), 0, 'campaigner A reads client 2 logs');
  INSERT INTO public.communication_logs (tenant_id, client_id, status, updated_by) VALUES (t_a, cl_1, 'happy', u_camp_a);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_1), 2, 'campaigner A logs for client 1');
  BEGIN
    INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_a, cl_2, 'Must be denied');
    RAISE EXCEPTION 'campaigner A logged for client 2, which they cannot see';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_b, cl_1, 'Must be denied');
    RAISE EXCEPTION 'campaigner A logged into another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.communication_logs SET note = 'Must be denied' WHERE client_id = cl_1;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'campaigner A edits a log (logs are read and added only)');
  DELETE FROM public.communication_logs WHERE client_id = cl_1;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'campaigner A deletes a log');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2)), 1, 'campaigner A reads task 1 collaborators only');
  INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES (task_1, cp_x, t_a);
  BEGIN
    INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES (task_2, cp_x, t_a);
    RAISE EXCEPTION 'campaigner A added a collaborator to task 2, which they cannot see';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES (task_1, cp_b, t_b);
    RAISE EXCEPTION 'campaigner A added a collaborator row in another tenant than its task';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.task_collaborators WHERE task_id = task_2;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'campaigner A removes task 2 collaborators');
  DELETE FROM public.task_collaborators WHERE task_id = task_1 AND campaigner_id = cp_x;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'campaigner A removes a task 1 collaborator');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id = lead_1), 0, 'campaigner reads lead assignments');
  INSERT INTO public.time_entry_breaks (time_entry_id, tenant_id) VALUES (entry_a, t_a);
  UPDATE public.time_entry_breaks SET end_time = now() WHERE time_entry_id = entry_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 2, 'campaigner A ends t_a breaks');
  BEGIN
    INSERT INTO public.time_entry_breaks (time_entry_id, tenant_id) VALUES (entry_b, t_b);
    RAISE EXCEPTION 'campaigner A added a break in another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.calendar_shares WHERE tenant_id = t_a), 1, 'campaigner A reads the share with them');
  UPDATE public.calendar_shares SET permission_level = 'view' WHERE tenant_id = t_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'campaigner A edits a share of someone else''s calendar');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.user_workspace_layout WHERE tenant_id = t_a), 1, 'campaigner A reads own layout only');
  INSERT INTO public.user_workspace_layout (user_id, tenant_id, module_id, width) VALUES (u_camp_a, t_a, 'qa', 400)
  ON CONFLICT (user_id, tenant_id, module_id) DO UPDATE SET width = excluded.width;
  BEGIN
    INSERT INTO public.user_workspace_layout (user_id, tenant_id, module_id) VALUES (u_owner, t_a, 'qa2');
    RAISE EXCEPTION 'campaigner A wrote the owner''s layout';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.tenant_templates (source_tenant_id, name, created_by) VALUES (t_a, 'Must be denied', u_camp_a);
    RAISE EXCEPTION 'campaigner A saved a tenant template (owner only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 2, 'campaigner A reads public and own presets');
  UPDATE public.terminology_presets SET name = 'QA ROLLBACK camp 2' WHERE id = pr_camp;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'campaigner A edits own preset');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id = au_a), 1, 'campaigner A reads the automation share');
  BEGIN
    INSERT INTO public.automation_shared_tenants (automation_id, tenant_id) VALUES (au_a, t_a);
    RAISE EXCEPTION 'campaigner A shared an automation (admins only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 1, 'campaigner A reads t_a automation runs');

  -- Campaigner B: no access to client 1, and a tenant-scoped super_admin role that grants nothing.
  PERFORM pg_temp.qa_act(u_camp_b);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_1), 0, 'campaigner B reads client 1 logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_2), 2, 'campaigner B reads client 2 logs');
  BEGIN
    INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_a, cl_1, 'Must be denied');
    RAISE EXCEPTION 'campaigner B logged for client 1, which they cannot see';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 1, 'tenant-scoped super_admin reads private presets');
  UPDATE public.terminology_presets SET name = 'Must be denied' WHERE id = pr_pub;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'tenant-scoped super_admin edits another user''s preset');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.error_logs WHERE tenant_id = ANY (v_tenants)), 0, 'tenant-scoped super_admin reads error logs');
  BEGIN
    INSERT INTO public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id) VALUES (u_owner, u_camp_b, t_a);
    RAISE EXCEPTION 'campaigner B shared the owner''s calendar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id) VALUES (u_camp_b, u_owner, t_a);

  -- Sales person: their own assignments, and the lead those assignments make visible.
  PERFORM pg_temp.qa_act(u_sales);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id = lead_1), 1, 'sales person reads own assignment');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.leads WHERE id = lead_1), 1, 'sales person reads the lead assigned through lead_sales_people');
  BEGIN
    INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_2, sp_1, t_a);
    RAISE EXCEPTION 'sales person assigned a lead (owner and team managers only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.lead_sales_people WHERE lead_id = lead_1;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'sales person removes an assignment');

  -- Owner of another tenant (t_b): nothing of t_a, its own rows, and the share into t_b.
  PERFORM pg_temp.qa_act(u_other);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = t_a), 0, 'other tenant reads t_a logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = t_b), 1, 'other tenant reads its own logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2)), 0, 'other tenant reads t_a collaborators');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = t_a), 0, 'other tenant reads t_a breaks');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id = lead_1), 0, 'other tenant reads t_a assignments');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.calendar_shares WHERE tenant_id = t_a), 0, 'other tenant reads t_a calendar shares');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.user_workspace_layout WHERE tenant_id = t_a), 0, 'other tenant reads t_a layouts');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id IN (tpl_a, tpl_b, tpl_pub)), 2, 'other tenant reads its own and public templates');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = t_a), 0, 'other tenant reads t_a automation runs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id = au_a), 1, 'other tenant reads the share into it');
  DELETE FROM public.automation_shared_tenants WHERE automation_id = au_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 0, 'other tenant stops a share it did not make');
  BEGIN
    INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_b, cl_1, 'Must be denied');
    RAISE EXCEPTION 'other tenant logged for a t_a client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Super admin, member of neither tenant: everything.
  PERFORM pg_temp.qa_act(u_admin);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants)), 5, 'super admin reads every log');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2)), 2, 'super admin reads every collaborator');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id = lead_1), 2, 'super admin reads every assignment');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = ANY (v_tenants)), 3, 'super admin reads every break');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.calendar_shares WHERE tenant_id = t_a), 2, 'super admin reads every calendar share');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 3, 'super admin reads every preset');
  UPDATE public.terminology_presets SET is_public = true WHERE id = pr_owner;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.qa_expect(n, 1, 'super admin edits any preset');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 2, 'super admin reads every automation run');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.error_logs WHERE tenant_id = ANY (v_tenants)), 1, 'super admin reads error logs');

  -- Anonymous: nothing.
  PERFORM pg_temp.qa_act(NULL, 'anon');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads collaborators');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads assignments');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads breaks');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 0, 'anon reads presets');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id IN (tpl_a, tpl_b, tpl_pub)), 0, 'anon reads templates');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads automation runs');
  BEGIN
    INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_a, cl_1, 'Must be denied');
    RAISE EXCEPTION 'anon wrote a log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.error_logs (tenant_id, source, error_message) VALUES (t_a, 'qa', 'Must be denied');
    RAISE EXCEPTION 'anon wrote an error log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.qa_act(NULL, 'none');
END;
$test$;
SELECT 'CRM, tasks, time, leads and tenant admin access rules passed' AS result;
ROLLBACK;
