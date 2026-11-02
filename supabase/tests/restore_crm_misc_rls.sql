-- CRM, tasks, time, leads and tenant admin access rules
-- (20261102108000_restore_crm_misc_rls and
-- 20261102113700_rls_super_admin_acting_tenant): who reads and writes
-- communication_logs, task_collaborators, time_entry_breaks,
-- lead_sales_people, calendar_shares, user_workspace_layout,
-- tenant_templates, terminology_presets, automation_shared_tenants,
-- automation_executions and error_logs. The test seeds its own users, tenants
-- and rows and rolls everything back, so it runs on a scratch database, a
-- Preview branch or Staging.
--
-- Inserts carry no RETURNING and no ON CONFLICT, and a created row is counted
-- as postgres, so only the INSERT policy decides them. Cross-tenant edits and
-- deletes are tried by personas that can read the row (the super admin, a
-- share's target tenant, the sales person), so a wide-open UPDATE or DELETE
-- policy cannot hide behind the SELECT policy.
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

-- Runs one write as the current persona and returns how many rows it changed.
CREATE FUNCTION pg_temp.qa_rows(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Fails the test unless the write is refused by row-level security (42501).
CREATE FUNCTION pg_temp.qa_refused(p_sql text, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION '%: expected a refusal', p_what;
END;
$$;

-- Counts rows as the session user (postgres, no RLS), then returns to the current persona.
CREATE FUNCTION pg_temp.qa_count(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  v_role text := current_setting('role');
  n bigint;
BEGIN
  PERFORM set_config('role', 'none', true);
  EXECUTE p_sql INTO n;
  PERFORM set_config('role', v_role, true);
  RETURN n;
END;
$$;

DO $test$
DECLARE
  v_tag text := left(gen_random_uuid()::text, 8);
  u_owner uuid := gen_random_uuid(); u_camp_a uuid := gen_random_uuid(); u_camp_b uuid := gen_random_uuid();
  u_sales uuid := gen_random_uuid(); u_other uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid();
  t_a uuid; t_b uuid; t_c uuid; v_tenants uuid[];
  ag_a uuid; ag_b uuid; cl_1 uuid; cl_2 uuid; cl_b uuid;
  cp_a uuid; cp_b uuid; cp_x uuid; cp_y uuid; cp_bb uuid; sp_1 uuid; sp_2 uuid; sp_b uuid;
  task_1 uuid; task_2 uuid; task_b uuid; entry_a uuid; entry_b uuid; brk_a uuid; brk_b uuid;
  lead_1 uuid; lead_2 uuid; lead_b uuid; lsp_b uuid; au_a uuid; au_b uuid;
  tpl_a uuid; tpl_b uuid; tpl_pub uuid; pr_pub uuid; pr_camp uuid; pr_owner uuid;
  v_id uuid;
  n bigint;
BEGIN
  -- Users of this run only; the auth trigger gives each a profile.
  INSERT INTO auth.users (id, email)
  SELECT x.u, 'qa-crm-rls-' || v_tag || '-' || x.i || '@example.invalid'
  FROM unnest(array[u_owner, u_camp_a, u_camp_b, u_sales, u_other, u_admin]) WITH ORDINALITY AS x (u, i);

  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK A', 'qa-crm-rls-a-' || v_tag) RETURNING id INTO t_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK B', 'qa-crm-rls-b-' || v_tag) RETURNING id INTO t_b;
  INSERT INTO public.tenants (name, slug) VALUES ('QA ROLLBACK C', 'qa-crm-rls-c-' || v_tag) RETURNING id INTO t_c;
  v_tenants := array[t_a, t_b, t_c];
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK A', t_a) RETURNING id INTO ag_a;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK B', t_b) RETURNING id INTO ag_b;
  INSERT INTO public.clients (name, tenant_id, agency_id) VALUES ('QA ROLLBACK 1', t_a, ag_a) RETURNING id INTO cl_1;
  INSERT INTO public.clients (name, tenant_id, agency_id) VALUES ('QA ROLLBACK 2', t_a, ag_a) RETURNING id INTO cl_2;
  INSERT INTO public.clients (name, tenant_id, agency_id) VALUES ('QA ROLLBACK B', t_b, ag_b) RETURNING id INTO cl_b;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK A', t_a) RETURNING id INTO cp_a;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK B', t_a) RETURNING id INTO cp_b;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK X', t_a) RETURNING id INTO cp_x;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK Y', t_a) RETURNING id INTO cp_y;
  INSERT INTO public.campaigners (full_name, tenant_id) VALUES ('QA ROLLBACK BB', t_b) RETURNING id INTO cp_bb;
  INSERT INTO public.sales_people (full_name, agency_id, tenant_id) VALUES ('QA ROLLBACK 1', ag_a, t_a) RETURNING id INTO sp_1;
  INSERT INTO public.sales_people (full_name, agency_id, tenant_id) VALUES ('QA ROLLBACK 2', ag_a, t_a) RETURNING id INTO sp_2;
  INSERT INTO public.sales_people (full_name, agency_id, tenant_id) VALUES ('QA ROLLBACK B', ag_b, t_b) RETURNING id INTO sp_b;

  -- Owner of t_a; campaigner A on client 1 only; campaigner B on client 2 only;
  -- a sales person; the owner of t_b; and a super admin who belongs to no
  -- tenant and acts in t_a, as after switching to it. Roles come before
  -- active tenants, as an active tenant must be one the user may use.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES
    (u_owner, t_a, 'owner'), (u_camp_a, t_a, 'member'), (u_camp_b, t_a, 'member'),
    (u_sales, t_a, 'member'), (u_other, t_b, 'owner');
  -- camp_b also holds a super_admin role scoped to t_a, which is not a super admin.
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (u_owner, 'owner', t_a), (u_camp_a, 'campaigner', t_a), (u_camp_b, 'campaigner', t_a),
    (u_camp_b, 'super_admin', t_a), (u_sales, 'sales_person', t_a), (u_other, 'owner', t_b),
    (u_admin, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (u_owner, t_a), (u_camp_a, t_a), (u_camp_b, t_a), (u_sales, t_a), (u_other, t_b), (u_admin, t_a);
  UPDATE public.profiles SET campaigner_id = cp_a, sales_person_id = NULL WHERE id = u_camp_a;
  UPDATE public.profiles SET campaigner_id = cp_b, sales_person_id = NULL WHERE id = u_camp_b;
  UPDATE public.profiles SET sales_person_id = sp_1, campaigner_id = NULL WHERE id = u_sales;
  INSERT INTO public.client_team (client_id, campaigner_id) VALUES (cl_1, cp_a), (cl_2, cp_b);

  INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES
    (t_a, cl_1, 'normal'), (t_a, cl_2, 'normal'), (t_b, cl_b, 'normal');
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id) VALUES ('QA ROLLBACK 1', t_a, ag_a, cp_a) RETURNING id INTO task_1;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id) VALUES ('QA ROLLBACK 2', t_a, ag_a, cp_b) RETURNING id INTO task_2;
  INSERT INTO public.tasks (title, tenant_id, agency_id, campaigner_id) VALUES ('QA ROLLBACK B', t_b, ag_b, cp_bb) RETURNING id INTO task_b;
  INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES
    (task_1, cp_b, t_a), (task_2, cp_a, t_a), (task_b, cp_bb, t_b);
  INSERT INTO public.time_entries (campaigner_id, start_time, tenant_id) VALUES (cp_a, now(), t_a) RETURNING id INTO entry_a;
  INSERT INTO public.time_entries (campaigner_id, start_time, tenant_id) VALUES (cp_bb, now(), t_b) RETURNING id INTO entry_b;
  INSERT INTO public.time_entry_breaks (time_entry_id, tenant_id) VALUES (entry_a, t_a) RETURNING id INTO brk_a;
  INSERT INTO public.time_entry_breaks (time_entry_id, tenant_id) VALUES (entry_b, t_b) RETURNING id INTO brk_b;
  INSERT INTO public.leads (company_name, tenant_id, agency_id) VALUES ('QA ROLLBACK 1', t_a, ag_a) RETURNING id INTO lead_1;
  INSERT INTO public.leads (company_name, tenant_id, agency_id) VALUES ('QA ROLLBACK 2', t_a, ag_a) RETURNING id INTO lead_2;
  INSERT INTO public.leads (company_name, tenant_id, agency_id) VALUES ('QA ROLLBACK B', t_b, ag_b) RETURNING id INTO lead_b;
  INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_1, sp_1, t_a), (lead_1, sp_2, t_a);
  INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_b, sp_b, t_b) RETURNING id INTO lsp_b;
  INSERT INTO public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id, permission_level) VALUES (u_owner, u_camp_a, t_a, 'view');
  INSERT INTO public.user_workspace_layout (user_id, tenant_id, module_id) VALUES (u_owner, t_a, 'qa'), (u_camp_a, t_a, 'qa');
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by, is_public) VALUES (t_a, 'QA ROLLBACK A', u_owner, false) RETURNING id INTO tpl_a;
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by, is_public) VALUES (t_b, 'QA ROLLBACK B', u_other, false) RETURNING id INTO tpl_b;
  INSERT INTO public.tenant_templates (source_tenant_id, name, created_by, is_public) VALUES (t_b, 'QA ROLLBACK public', u_other, true) RETURNING id INTO tpl_pub;
  INSERT INTO public.terminology_presets (name, terms, is_public, created_by_user_id) VALUES ('QA ROLLBACK public', '[]', true, u_other) RETURNING id INTO pr_pub;
  INSERT INTO public.terminology_presets (name, terms, is_public, created_by_user_id) VALUES ('QA ROLLBACK camp', '[]', false, u_camp_a) RETURNING id INTO pr_camp;
  INSERT INTO public.terminology_presets (name, terms, is_public, created_by_user_id) VALUES ('QA ROLLBACK owner', '[]', false, u_owner) RETURNING id INTO pr_owner;
  INSERT INTO public.automations (name, tenant_id, trigger_type, action_type, configuration)
  VALUES ('QA ROLLBACK A', t_a, 'task_assigned', 'webhook', '{}') RETURNING id INTO au_a;
  INSERT INTO public.automations (name, tenant_id, trigger_type, action_type, configuration)
  VALUES ('QA ROLLBACK B', t_b, 'task_assigned', 'webhook', '{}') RETURNING id INTO au_b;
  -- t_a's automation is shared into t_b; t_b's into t_c, which no persona of t_a may see.
  INSERT INTO public.automation_shared_tenants (automation_id, tenant_id) VALUES (au_a, t_b), (au_b, t_c);
  INSERT INTO public.automation_executions (execution_id, tenant_id, automation_id) VALUES ('qa-a-' || v_tag, t_a, au_a), ('qa-b-' || v_tag, t_b, NULL);
  INSERT INTO public.error_logs (tenant_id, source, error_message) VALUES (t_a, 'qa', 'QA ROLLBACK');

  -- Owner of t_a: every client's log, every task's collaborators, every assignment of the tenant.
  PERFORM pg_temp.qa_act(u_owner);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants)), 2, 'owner reads t_a client logs');
  INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_a, cl_2, 'qa-owner-' || v_tag);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.communication_logs where status = %L', 'qa-owner-' || v_tag)), 1, 'owner logs for client 2');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2, task_b)), 2, 'owner reads t_a tasks'' collaborators');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id IN (lead_1, lead_b)), 2, 'owner reads t_a assignments');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.lead_sales_people where lead_id = %L and sales_person_id = %L', lead_1, sp_2)), 1, 'owner removes an assignment');
  INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_1, sp_2, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.lead_sales_people where lead_id = %L', lead_1)), 2, 'owner assigns a sales person');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.lead_sales_people set tenant_id = tenant_id where lead_id = %L', lead_1)), 2, 'owner edits t_a assignments');
  PERFORM pg_temp.qa_refused(format('update public.lead_sales_people set tenant_id = %L where lead_id = %L', t_b, lead_1), 'owner moves an assignment to t_b');
  PERFORM pg_temp.qa_refused(format('insert into public.lead_sales_people (lead_id, sales_person_id, tenant_id) values (%L, %L, %L)', lead_b, sp_1, t_b), 'owner assigns in t_b');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a breaks');

  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.calendar_shares set permission_level = %L where owner_user_id = %L and tenant_id = %L', 'full', u_owner, t_a)), 1, 'owner edits own calendar share');
  PERFORM pg_temp.qa_refused(format('update public.calendar_shares set tenant_id = %L where owner_user_id = %L', t_b, u_owner), 'owner moves own calendar share to t_b');
  INSERT INTO public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id) VALUES (u_owner, u_sales, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.calendar_shares where owner_user_id = %L and shared_with_user_id = %L', u_owner, u_sales)), 1, 'owner shares own calendar');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.calendar_shares where owner_user_id = %L and shared_with_user_id = %L', u_owner, u_sales)), 1, 'owner stops sharing own calendar');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id IN (tpl_a, tpl_b, tpl_pub)), 2, 'owner reads own and public templates');
  v_id := gen_random_uuid();
  INSERT INTO public.tenant_templates (id, source_tenant_id, name, created_by) VALUES (v_id, t_a, 'QA ROLLBACK A2', u_owner);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.tenant_templates where id = %L', v_id)), 1, 'owner saves t_a as a template');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.tenant_templates set name = %L where id = %L', 'QA ROLLBACK A edited', tpl_a)), 1, 'owner edits own template');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.tenant_templates set name = %L where id in (%L, %L)', 'Must be denied', tpl_b, tpl_pub)), 0, 'owner edits another tenant''s templates');
  PERFORM pg_temp.qa_refused(format('update public.tenant_templates set source_tenant_id = %L where id = %L', t_b, tpl_a), 'owner moves own template to t_b');
  -- Made public, the moved row stays readable, so only the UPDATE check refuses it.
  PERFORM pg_temp.qa_refused(format('update public.tenant_templates set source_tenant_id = %L, is_public = true where id = %L', t_b, tpl_a), 'owner moves own template to t_b as a public one');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.tenant_templates where id in (%L, %L)', v_id, tpl_pub)), 1, 'owner removes own template, not the public one');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id IN (au_a, au_b)), 1, 'owner reads t_a''s automation share only');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.automation_shared_tenants where automation_id = %L and tenant_id = %L', au_a, t_b)), 1, 'owner stops the automation share');
  INSERT INTO public.automation_shared_tenants (automation_id, tenant_id, shared_by) VALUES (au_a, t_b, u_owner);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.automation_shared_tenants where automation_id = %L and tenant_id = %L', au_a, t_b)), 1, 'owner shares the automation again');
  PERFORM pg_temp.qa_refused(format('insert into public.automation_shared_tenants (automation_id, tenant_id) values (%L, %L)', au_b, t_a), 'owner shares t_b''s automation');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 1, 'owner reads t_a automation runs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.error_logs WHERE tenant_id = ANY (v_tenants)), 0, 'owner reads error logs (super admin only)');
  PERFORM pg_temp.qa_refused(format('insert into public.error_logs (tenant_id, source, error_message) values (%L, %L, %L)', t_a, 'qa', 'Must be denied'), 'owner writes an error log (service role only)');
  PERFORM pg_temp.qa_refused(format('insert into public.automation_executions (execution_id, tenant_id) values (%L, %L)', 'Must be denied', t_a), 'owner writes an automation run (service role only)');

  -- Campaigner A: client 1 only, task 1 only.
  PERFORM pg_temp.qa_act(u_camp_a);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_1), 1, 'campaigner A reads client 1 logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_2), 0, 'campaigner A reads client 2 logs');
  INSERT INTO public.communication_logs (tenant_id, client_id, status, updated_by) VALUES (t_a, cl_1, 'qa-camp-a-' || v_tag, u_camp_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.communication_logs where status = %L', 'qa-camp-a-' || v_tag)), 1, 'campaigner A logs for client 1');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_a, cl_2, 'Must be denied'), 'campaigner A logs for client 2, which they cannot see');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_b, cl_1, 'Must be denied'), 'campaigner A logs into another tenant');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.communication_logs set note = %L where client_id = %L', 'Must be denied', cl_1)), 0, 'campaigner A edits a log (logs are read and added only)');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.communication_logs where client_id = %L', cl_1)), 0, 'campaigner A deletes a log');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2, task_b)), 1, 'campaigner A reads task 1 collaborators only');
  INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES (task_1, cp_x, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.task_collaborators where task_id = %L and campaigner_id = %L', task_1, cp_x)), 1, 'campaigner A adds a task 1 collaborator');
  PERFORM pg_temp.qa_refused(format('insert into public.task_collaborators (task_id, campaigner_id, tenant_id) values (%L, %L, %L)', task_2, cp_x, t_a), 'campaigner A adds a collaborator to task 2, which they cannot see');
  PERFORM pg_temp.qa_refused(format('insert into public.task_collaborators (task_id, campaigner_id, tenant_id) values (%L, %L, %L)', task_1, cp_y, t_b), 'campaigner A adds a collaborator row in another tenant than its task');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.task_collaborators where task_id = %L', task_2)), 0, 'campaigner A removes task 2 collaborators');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.task_collaborators where task_id = %L and campaigner_id = %L', task_1, cp_x)), 1, 'campaigner A removes a task 1 collaborator');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id IN (lead_1, lead_b)), 0, 'campaigner A reads lead assignments');
  v_id := gen_random_uuid();
  INSERT INTO public.time_entry_breaks (id, time_entry_id, tenant_id) VALUES (v_id, entry_a, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.time_entry_breaks where id = %L', v_id)), 1, 'campaigner A adds a t_a break');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.time_entry_breaks set end_time = now() where time_entry_id = %L', entry_a)), 2, 'campaigner A ends t_a breaks');
  PERFORM pg_temp.qa_refused(format('update public.time_entry_breaks set tenant_id = %L where id = %L', t_b, v_id), 'campaigner A moves a break to t_b');
  PERFORM pg_temp.qa_refused(format('insert into public.time_entry_breaks (time_entry_id, tenant_id) values (%L, %L)', entry_b, t_b), 'campaigner A adds a break in another tenant');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.time_entry_breaks where id = %L', v_id)), 1, 'campaigner A deletes a t_a break');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.calendar_shares WHERE tenant_id = t_a), 1, 'campaigner A reads the share with them');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.calendar_shares set permission_level = %L where tenant_id = %L', 'view', t_a)), 0, 'campaigner A edits a share of someone else''s calendar');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.calendar_shares where tenant_id = %L', t_a)), 0, 'campaigner A removes a share of someone else''s calendar');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.user_workspace_layout WHERE tenant_id = t_a), 1, 'campaigner A reads own layout only');
  INSERT INTO public.user_workspace_layout (user_id, tenant_id, module_id, width) VALUES (u_camp_a, t_a, 'qa2', 400);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.user_workspace_layout where user_id = %L and module_id = %L', u_camp_a, 'qa2')), 1, 'campaigner A saves own layout');
  PERFORM pg_temp.qa_refused(format('insert into public.user_workspace_layout (user_id, tenant_id, module_id) values (%L, %L, %L)', u_owner, t_a, 'qa3'), 'campaigner A writes the owner''s layout');

  PERFORM pg_temp.qa_refused(format('insert into public.tenant_templates (source_tenant_id, name, created_by) values (%L, %L, %L)', t_a, 'Must be denied', u_camp_a), 'campaigner A saves a tenant template (owner only)');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id = tpl_a), 1, 'campaigner A reads t_a''s template');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.tenant_templates set name = %L where id = %L', 'Must be denied', tpl_a)), 0, 'campaigner A edits t_a''s template (owner only)');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.tenant_templates where id = %L', tpl_a)), 0, 'campaigner A removes t_a''s template (owner only)');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 2, 'campaigner A reads public and own presets');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.terminology_presets set name = %L where id = %L', 'QA ROLLBACK camp 2', pr_camp)), 1, 'campaigner A edits own preset');
  PERFORM pg_temp.qa_refused(format('update public.terminology_presets set created_by_user_id = %L where id = %L', u_owner, pr_camp), 'campaigner A hands own preset to the owner');
  PERFORM pg_temp.qa_refused(format('insert into public.terminology_presets (name, terms, created_by_user_id) values (%L, %L, %L)', 'Must be denied', '[]', u_owner), 'campaigner A creates a preset as the owner');
  INSERT INTO public.terminology_presets (name, terms, created_by_user_id) VALUES ('qa-camp-a-' || v_tag, '[]', u_camp_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.terminology_presets where name = %L', 'qa-camp-a-' || v_tag)), 1, 'campaigner A creates own preset');

  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id = au_a), 1, 'campaigner A reads t_a''s automation share');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id = au_b), 0, 'campaigner A reads a share between two other tenants');
  PERFORM pg_temp.qa_refused(format('insert into public.automation_shared_tenants (automation_id, tenant_id) values (%L, %L)', au_a, t_c), 'campaigner A shares an automation (admins only)');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.automation_shared_tenants where automation_id = %L', au_a)), 0, 'campaigner A stops a share (admins only)');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 1, 'campaigner A reads t_a automation runs');

  -- Campaigner B: no access to client 1, and a tenant-scoped super_admin role that grants nothing.
  PERFORM pg_temp.qa_act(u_camp_b);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_1), 0, 'campaigner B reads client 1 logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE client_id = cl_2), 2, 'campaigner B reads client 2 logs');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_a, cl_1, 'Must be denied'), 'campaigner B logs for client 1, which they cannot see');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 1, 'tenant-scoped super_admin reads private presets');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.terminology_presets set name = %L where id = %L', 'Must be denied', pr_pub)), 0, 'tenant-scoped super_admin edits another user''s preset');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.error_logs WHERE tenant_id = ANY (v_tenants)), 0, 'tenant-scoped super_admin reads error logs');
  PERFORM pg_temp.qa_refused(format('insert into public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id) values (%L, %L, %L)', u_owner, u_camp_b, t_a), 'campaigner B shares the owner''s calendar');
  INSERT INTO public.calendar_shares (owner_user_id, shared_with_user_id, tenant_id) VALUES (u_camp_b, u_owner, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.calendar_shares where owner_user_id = %L', u_camp_b)), 1, 'campaigner B shares own calendar');

  -- Sales person: their own assignments, and the lead those assignments make visible.
  PERFORM pg_temp.qa_act(u_sales);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id IN (lead_1, lead_b)), 1, 'sales person reads own assignment');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.leads WHERE id = lead_1), 1, 'sales person reads the lead assigned through lead_sales_people');
  PERFORM pg_temp.qa_refused(format('insert into public.lead_sales_people (lead_id, sales_person_id, tenant_id) values (%L, %L, %L)', lead_2, sp_1, t_a), 'sales person assigns a lead (owner and team managers only)');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.lead_sales_people set tenant_id = tenant_id where lead_id = %L', lead_1)), 0, 'sales person edits own assignment');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.lead_sales_people where lead_id = %L', lead_1)), 0, 'sales person removes an assignment');

  -- Owner of another tenant (t_b): nothing of t_a, its own rows, and the share into t_b.
  PERFORM pg_temp.qa_act(u_other);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = t_a), 0, 'other tenant reads t_a logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = t_b), 1, 'other tenant reads its own logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2)), 0, 'other tenant reads t_a collaborators');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = t_a), 0, 'other tenant reads t_a breaks');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id = lead_1), 0, 'other tenant reads t_a assignments');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.calendar_shares WHERE tenant_id = t_a), 0, 'other tenant reads t_a calendar shares');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.user_workspace_layout WHERE tenant_id = t_a), 0, 'other tenant reads t_a layouts');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id IN (tpl_a, tpl_b)), 1, 'other tenant reads its own template only');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = t_a), 0, 'other tenant reads t_a automation runs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id IN (au_a, au_b)), 2, 'other tenant reads the share into it and its own automation''s share');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.automation_shared_tenants where automation_id = %L', au_a)), 0, 'other tenant stops a share it did not make');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_b, cl_1, 'Must be denied'), 'other tenant logs for a t_a client');

  -- Super admin acting in t_a: reads every tenant, writes only in t_a. The
  -- global catalogs (tenant_templates, terminology_presets) are the exception.
  PERFORM pg_temp.qa_act(NULL, 'none');
  n := (SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants));
  PERFORM pg_temp.qa_act(u_admin);
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants)), n, 'super admin reads every log');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE task_id IN (task_1, task_2, task_b)), 3, 'super admin reads every collaborator');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE lead_id IN (lead_1, lead_b)), 3, 'super admin reads every assignment');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = ANY (v_tenants)), 2, 'super admin reads every break');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.calendar_shares WHERE tenant_id = t_a), 2, 'super admin reads every calendar share');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_shared_tenants WHERE automation_id IN (au_a, au_b)), 2, 'super admin reads every automation share');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 2, 'super admin reads every automation run');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.error_logs WHERE tenant_id = ANY (v_tenants)), 1, 'super admin reads error logs');

  INSERT INTO public.communication_logs (tenant_id, client_id, status) VALUES (t_a, cl_1, 'qa-admin-' || v_tag);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.communication_logs where status = %L', 'qa-admin-' || v_tag)), 1, 'super admin logs for a t_a client');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_b, cl_b, 'Must be denied'), 'super admin logs into t_b');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_a, cl_b, 'Must be denied'), 'super admin logs for a t_b client from t_a');

  INSERT INTO public.task_collaborators (task_id, campaigner_id, tenant_id) VALUES (task_1, cp_y, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.task_collaborators where task_id = %L and campaigner_id = %L', task_1, cp_y)), 1, 'super admin adds a collaborator to a t_a task');
  PERFORM pg_temp.qa_refused(format('insert into public.task_collaborators (task_id, campaigner_id, tenant_id) values (%L, %L, %L)', task_b, cp_y, t_b), 'super admin adds a collaborator to a t_b task');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.task_collaborators where task_id = %L', task_b)), 0, 'super admin removes a t_b task''s collaborators');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.task_collaborators where task_id = %L and campaigner_id = %L', task_1, cp_y)), 1, 'super admin removes a t_a task''s collaborator');

  v_id := gen_random_uuid();
  INSERT INTO public.time_entry_breaks (id, time_entry_id, tenant_id) VALUES (v_id, entry_a, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.time_entry_breaks where id = %L', v_id)), 1, 'super admin adds a t_a break');
  PERFORM pg_temp.qa_refused(format('insert into public.time_entry_breaks (time_entry_id, tenant_id) values (%L, %L)', entry_b, t_b), 'super admin adds a t_b break');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.time_entry_breaks set end_time = now() where id = %L', brk_b)), 0, 'super admin edits a t_b break');
  PERFORM pg_temp.qa_refused(format('update public.time_entry_breaks set tenant_id = %L where id = %L', t_b, v_id), 'super admin moves a t_a break to t_b');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.time_entry_breaks where id = %L', brk_b)), 0, 'super admin deletes a t_b break');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.time_entry_breaks where id = %L', v_id)), 1, 'super admin deletes a t_a break');

  INSERT INTO public.lead_sales_people (lead_id, sales_person_id, tenant_id) VALUES (lead_2, sp_1, t_a);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.lead_sales_people where lead_id = %L', lead_2)), 1, 'super admin assigns a sales person in t_a');
  PERFORM pg_temp.qa_refused(format('insert into public.lead_sales_people (lead_id, sales_person_id, tenant_id) values (%L, %L, %L)', lead_b, sp_1, t_b), 'super admin assigns a sales person in t_b');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.lead_sales_people set tenant_id = tenant_id where id = %L', lsp_b)), 0, 'super admin edits a t_b assignment');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.lead_sales_people set tenant_id = tenant_id where lead_id = %L', lead_2)), 1, 'super admin edits a t_a assignment');
  PERFORM pg_temp.qa_refused(format('update public.lead_sales_people set tenant_id = %L where lead_id = %L', t_b, lead_2), 'super admin moves a t_a assignment to t_b');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.lead_sales_people where id = %L', lsp_b)), 0, 'super admin removes a t_b assignment');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.lead_sales_people where lead_id = %L', lead_2)), 1, 'super admin removes a t_a assignment');

  INSERT INTO public.automation_shared_tenants (automation_id, tenant_id) VALUES (au_a, t_c);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.automation_shared_tenants where automation_id = %L and tenant_id = %L', au_a, t_c)), 1, 'super admin shares a t_a automation');
  PERFORM pg_temp.qa_refused(format('insert into public.automation_shared_tenants (automation_id, tenant_id) values (%L, %L)', au_b, t_a), 'super admin shares a t_b automation');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.automation_shared_tenants where automation_id = %L', au_b)), 0, 'super admin stops a t_b automation''s share');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.automation_shared_tenants where automation_id = %L and tenant_id = %L', au_a, t_c)), 1, 'super admin stops a t_a automation''s share');

  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.calendar_shares set permission_level = %L where tenant_id = %L', 'book', t_a)), 0, 'super admin edits someone else''s calendar share');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.calendar_shares where tenant_id = %L', t_a)), 0, 'super admin removes someone else''s calendar share');

  -- The exception: super admins curate the template and terminology catalogs of every tenant.
  v_id := gen_random_uuid();
  INSERT INTO public.tenant_templates (id, source_tenant_id, name, created_by) VALUES (v_id, t_b, 'QA ROLLBACK catalog', u_admin);
  PERFORM pg_temp.qa_expect(pg_temp.qa_count(format('select count(*) from public.tenant_templates where id = %L', v_id)), 1, 'super admin adds a template of t_b (catalog)');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.tenant_templates set name = %L where id = %L', 'QA ROLLBACK B edited', tpl_b)), 1, 'super admin edits t_b''s template (catalog)');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('delete from public.tenant_templates where id = %L', v_id)), 1, 'super admin removes a template of t_b (catalog)');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 3, 'super admin reads every preset');
  PERFORM pg_temp.qa_expect(pg_temp.qa_rows(format('update public.terminology_presets set is_public = true where id = %L', pr_owner)), 1, 'super admin edits any preset (catalog)');

  -- Anonymous: nothing.
  PERFORM pg_temp.qa_act(NULL, 'anon');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.communication_logs WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads logs');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.task_collaborators WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads collaborators');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.lead_sales_people WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads assignments');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.time_entry_breaks WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads breaks');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.terminology_presets WHERE id IN (pr_pub, pr_camp, pr_owner)), 0, 'anon reads presets');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.tenant_templates WHERE id IN (tpl_a, tpl_b, tpl_pub)), 0, 'anon reads templates');
  PERFORM pg_temp.qa_expect((SELECT count(*) FROM public.automation_executions WHERE tenant_id = ANY (v_tenants)), 0, 'anon reads automation runs');
  PERFORM pg_temp.qa_refused(format('insert into public.communication_logs (tenant_id, client_id, status) values (%L, %L, %L)', t_a, cl_1, 'Must be denied'), 'anon writes a log');
  PERFORM pg_temp.qa_refused(format('insert into public.error_logs (tenant_id, source, error_message) values (%L, %L, %L)', t_a, 'qa', 'Must be denied'), 'anon writes an error log');

  PERFORM pg_temp.qa_act(NULL, 'none');
END;
$test$;
SELECT 'CRM, tasks, time, leads and tenant admin access rules passed' AS result;
ROLLBACK;
