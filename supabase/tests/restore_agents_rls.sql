-- Agents studio access rules (20261102103000_restore_agents_rls and
-- 20261102113700_rls_super_admin_acting_tenant): synthetic tenants, people and
-- rows inside one transaction that is rolled back.
-- Personas: tenant A's owner and member, tenant B's member, a super admin
-- acting in tenant A (an active tenant without membership, as the switcher
-- sets it), and anon. Each check looks only at this run's fixture rows, so
-- existing data on Staging does not change the counts.
-- Inserts carry no RETURNING, so only the INSERT rule decides them; a created
-- row is confirmed by counting it as postgres.
BEGIN;
DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_agent_a uuid := gen_random_uuid();
  v_agent_b uuid := gen_random_uuid();
  v_global_tool uuid := gen_random_uuid();
  -- One minimal row per table: $1 tenant, $2 an agent of that tenant, $3 a unique text, $4 the row id.
  -- An eval run belongs to an eval of the tenant, and a supervisor link names a child agent of the
  -- tenant it does not link yet (20261103100000 restores those keys).
  v_insert jsonb := jsonb_build_object(
    'agent_evals', 'insert into public.agent_evals (id, tenant_id, agent_id, name) values ($4, $1, $2, $3)',
    'agent_eval_runs', 'insert into public.agent_eval_runs (id, tenant_id, eval_id, agent_id) values ($4, $1, (select e.id from public.agent_evals as e where e.tenant_id = $1 order by e.id limit 1), $2)',
    'agent_supervisors', 'insert into public.agent_supervisors (id, tenant_id, supervisor_agent_id, child_agent_id) values ($4, $1, $2, (select a.id from public.ai_agents as a where a.tenant_id = $1 and not exists (select 1 from public.agent_supervisors as s where s.supervisor_agent_id = $2 and s.child_agent_id = a.id) order by a.id limit 1))',
    'agent_goals', 'insert into public.agent_goals (id, tenant_id, agent_id, title) values ($4, $1, $2, $3)',
    'agent_knowledge_folders', 'insert into public.agent_knowledge_folders (id, tenant_id, agent_id, name) values ($4, $1, $2, $3)',
    'agent_knowledge_items', 'insert into public.agent_knowledge_items (id, tenant_id, agent_id, title) values ($4, $1, $2, $3)',
    'agent_memory', 'insert into public.agent_memory (id, tenant_id, agent_id, title) values ($4, $1, $2, $3)',
    'agent_user_profiles', 'insert into public.agent_user_profiles (id, tenant_id, contact_phone) values ($4, $1, $3)',
    'agent_runs', 'insert into public.agent_runs (id, tenant_id, agent_id, goal) values ($4, $1, $2, $3)',
    'social_publications', 'insert into public.social_publications (id, tenant_id, platform, post_type) values ($4, $1, ''qa'', ''post'')',
    'manus_tasks', 'insert into public.manus_tasks (id, tenant_id, task_id, prompt) values ($4, $1, $3, $3)',
    'agent_tools', 'insert into public.agent_tools (id, tenant_id, name, display_name) values ($4, $1, $3, $3)'
  );
  -- Members of the active tenant read, create, edit and delete these.
  v_manage text[] := array[
    'agent_evals', 'agent_eval_runs', 'agent_supervisors', 'agent_goals', 'agent_knowledge_folders',
    'agent_knowledge_items', 'agent_memory', 'agent_user_profiles', 'agent_tools'
  ];
  -- Members only read these; edge functions write them with the service role.
  v_read_only text[] := array['agent_runs', 'social_publications'];
  v_tables text[] := v_manage || v_read_only || array['manus_tasks'];
  v_row_a jsonb := '{}';
  v_row_b jsonb := '{}';
  v_person uuid;
  v_t text;
  v_id uuid;
  v_rows integer;
  v_expected integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-agents-rls-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_owner, v_member, v_outsider, v_admin]) AS u;
  INSERT INTO public.tenants (id, name, slug) VALUES
    (v_a, 'QA agents A', 'qa-agents-a-' || v_tag), (v_b, 'QA agents B', 'qa-agents-b-' || v_tag);
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_a, v_owner, 'owner'), (v_a, v_member, 'member'), (v_b, v_outsider, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (v_owner, 'owner', v_a), (v_member, 'campaigner', v_a), (v_outsider, 'campaigner', v_b),
    (v_admin, 'super_admin', NULL);
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (v_owner, v_a), (v_member, v_a), (v_outsider, v_b), (v_admin, v_a);
  INSERT INTO public.ai_agents (id, tenant_id, name) VALUES
    (v_agent_a, v_a, 'QA agent A'), (v_agent_b, v_b, 'QA agent B'),
    (gen_random_uuid(), v_a, 'QA agent A2'), (gen_random_uuid(), v_b, 'QA agent B2');
  FOREACH v_t IN ARRAY v_tables LOOP
    v_row_a := v_row_a || jsonb_build_object(v_t, gen_random_uuid());
    EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-a-' || v_tag, (v_row_a ->> v_t)::uuid;
    v_row_b := v_row_b || jsonb_build_object(v_t, gen_random_uuid());
    EXECUTE v_insert ->> v_t USING v_b, v_agent_b, 'qa-b-' || v_tag, (v_row_b ->> v_t)::uuid;
  END LOOP;
  EXECUTE v_insert ->> 'agent_tools' USING NULL::uuid, NULL::uuid, 'qa-global-' || v_tag, v_global_tool;

  -- Tenant A's owner and member read A's rows, run logs included, and nothing of B.
  FOREACH v_person IN ARRAY ARRAY[v_owner, v_member] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_person::text, true);
    SET LOCAL ROLE authenticated;
    FOREACH v_t IN ARRAY v_tables LOOP
      EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING (v_row_a ->> v_t)::uuid;
      IF v_rows <> 1 THEN RAISE EXCEPTION '%: own tenant row is not readable (person %)', v_t, v_person; END IF;
      EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING (v_row_b ->> v_t)::uuid;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: another tenant row is readable (person %)', v_t, v_person; END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.agent_tools WHERE id = v_global_tool) THEN
      RAISE EXCEPTION 'agent_tools: a global tool is not readable';
    END IF;
    RESET ROLE;
  END LOOP;

  -- The super admin acting in A reads every tenant's rows.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('select count(*) from public.%I where id in ($1, $2)', v_t)
      INTO v_rows USING (v_row_a ->> v_t)::uuid, (v_row_b ->> v_t)::uuid;
    IF v_rows <> 2 THEN
      RAISE EXCEPTION '%: super admin reads % of the two tenants'' rows, expected 2', v_t, v_rows;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.agent_tools WHERE id = v_global_tool) THEN
    RAISE EXCEPTION 'agent_tools: a global tool is not readable by the super admin';
  END IF;
  RESET ROLE;

  -- Owner, member and the super admin write only in A, the tenant they act in.
  FOREACH v_person IN ARRAY ARRAY[v_owner, v_member, v_admin] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_person::text, true);
    SET LOCAL ROLE authenticated;
    FOREACH v_t IN ARRAY v_manage || array['manus_tasks'] LOOP
      v_id := gen_random_uuid();
      EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-m-' || v_id, v_id;
      RESET ROLE;
      EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING v_id;
      SET LOCAL ROLE authenticated;
      IF v_rows <> 1 THEN RAISE EXCEPTION '%: own tenant row was not created (person %)', v_t, v_person; END IF;
      EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING v_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN RAISE EXCEPTION '%: own tenant row is not editable (person %)', v_t, v_person; END IF;
      BEGIN
        EXECUTE format('update public.%I set tenant_id = $2 where id = $1', v_t) USING v_id, v_b;
        RAISE EXCEPTION '%: a row can be moved to another tenant (person %)', v_t, v_person;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      -- Nothing deletes a Manus task, so that table has no delete rule.
      v_expected := (v_t <> 'manus_tasks')::integer;
      EXECUTE format('delete from public.%I where id = $1', v_t) USING v_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> v_expected THEN RAISE EXCEPTION '%: delete matched % rows (person %)', v_t, v_rows, v_person; END IF;
    END LOOP;

    FOREACH v_t IN ARRAY v_tables LOOP
      BEGIN
        EXECUTE v_insert ->> v_t USING v_b, v_agent_b, 'qa-x-' || gen_random_uuid(), gen_random_uuid();
        RAISE EXCEPTION '%: a row can be created in another tenant (person %)', v_t, v_person;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING (v_row_b ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: another tenant row is editable (person %)', v_t, v_person; END IF;
      EXECUTE format('delete from public.%I where id = $1', v_t) USING (v_row_b ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: another tenant row is deletable (person %)', v_t, v_person; END IF;
    END LOOP;

    -- No WHERE clause, so only the UPDATE rule picks the rows; B's task must stay untouched.
    UPDATE public.manus_tasks SET status = 'qa-probe';
    RESET ROLE;
    IF EXISTS (SELECT 1 FROM public.manus_tasks WHERE id = (v_row_b ->> 'manus_tasks')::uuid AND status = 'qa-probe') THEN
      RAISE EXCEPTION 'manus_tasks: an edit reaches another tenant (person %)', v_person;
    END IF;
    SET LOCAL ROLE authenticated;

    FOREACH v_t IN ARRAY v_read_only LOOP
      BEGIN
        EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-r-' || gen_random_uuid(), gen_random_uuid();
        RAISE EXCEPTION '%: a row can be created (person %)', v_t, v_person;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING (v_row_a ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: a row is editable (person %)', v_t, v_person; END IF;
      EXECUTE format('delete from public.%I where id = $1', v_t) USING (v_row_a ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: a row is deletable (person %)', v_t, v_person; END IF;
    END LOOP;

    UPDATE public.agent_tools SET enabled = NOT enabled WHERE id = v_global_tool;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'agent_tools: a global tool is editable (person %)', v_person; END IF;
    DELETE FROM public.agent_tools WHERE id = v_global_tool;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'agent_tools: a global tool is deletable (person %)', v_person; END IF;
    BEGIN
      EXECUTE v_insert ->> 'agent_tools' USING NULL::uuid, NULL::uuid, 'qa-g-' || gen_random_uuid(), gen_random_uuid();
      RAISE EXCEPTION 'agent_tools: a global tool can be created (person %)', v_person;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      INSERT INTO public.agent_batch_reports (batch_id) VALUES (gen_random_uuid());
      RAISE EXCEPTION 'agent_batch_reports: a service-only table is writable (person %)', v_person;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;

  -- Tenant B's member: nothing of tenant A, only their own tenant's rows.
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING (v_row_a ->> v_t)::uuid;
    IF v_rows <> 0 THEN RAISE EXCEPTION '%: tenant B reads tenant A', v_t; END IF;
    EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING (v_row_b ->> v_t)::uuid;
    IF v_rows <> 1 THEN RAISE EXCEPTION '%: tenant B cannot read its own row', v_t; END IF;
    EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING (v_row_a ->> v_t)::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION '%: tenant B edits tenant A', v_t; END IF;
    EXECUTE format('delete from public.%I where id = $1', v_t) USING (v_row_a ->> v_t)::uuid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION '%: tenant B deletes tenant A', v_t; END IF;
    BEGIN
      EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-o-' || gen_random_uuid(), gen_random_uuid();
      RAISE EXCEPTION '%: tenant B creates a row in tenant A', v_t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RESET ROLE;

  -- anon: reads nothing and creates nothing, in every table of the group.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('select count(*) from public.%I where id in ($1, $2, $3)', v_t)
      INTO v_rows USING (v_row_a ->> v_t)::uuid, (v_row_b ->> v_t)::uuid, v_global_tool;
    IF v_rows <> 0 THEN RAISE EXCEPTION '%: anon reads % rows', v_t, v_rows; END IF;
    BEGIN
      EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-anon-' || gen_random_uuid(), gen_random_uuid();
      RAISE EXCEPTION '%: anon can create a row', v_t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    EXECUTE v_insert ->> 'agent_tools' USING NULL::uuid, NULL::uuid, 'qa-anon-' || v_tag, gen_random_uuid();
    RAISE EXCEPTION 'agent_tools: anon can create a global tool';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agent_batch_reports (batch_id) VALUES (gen_random_uuid());
    RAISE EXCEPTION 'agent_batch_reports: anon can create a row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.agent_tool_embeddings (tool_name, sig) VALUES ('qa-anon-' || v_tag, 'qa');
    RAISE EXCEPTION 'agent_tool_embeddings: anon can create a row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END;
$test$;
SELECT 'Agents studio: members read run logs and manage their tenant, super admins write only where they act, anon is denied' AS result;
ROLLBACK;
