-- Agents studio access rules (20261102103000_restore_agents_rls): synthetic
-- tenants, people and rows inside one transaction that is rolled back.
-- Personas: tenant A's owner and member, tenant B's member, a super admin and
-- anon. Each check looks only at this run's fixture rows, so existing data on
-- Staging does not change the counts.
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
  -- One minimal row per table: $1 tenant, $2 an agent of that tenant, $3 a unique text.
  v_insert jsonb := jsonb_build_object(
    'agent_evals', 'insert into public.agent_evals (tenant_id, agent_id, name) values ($1, $2, $3) returning id',
    'agent_eval_runs', 'insert into public.agent_eval_runs (tenant_id, eval_id, agent_id) values ($1, gen_random_uuid(), $2) returning id',
    'agent_supervisors', 'insert into public.agent_supervisors (tenant_id, supervisor_agent_id, child_agent_id) values ($1, $2, $2) returning id',
    'agent_goals', 'insert into public.agent_goals (tenant_id, agent_id, title) values ($1, $2, $3) returning id',
    'agent_knowledge_folders', 'insert into public.agent_knowledge_folders (tenant_id, agent_id, name) values ($1, $2, $3) returning id',
    'agent_knowledge_items', 'insert into public.agent_knowledge_items (tenant_id, agent_id, title) values ($1, $2, $3) returning id',
    'agent_memory', 'insert into public.agent_memory (tenant_id, agent_id, title) values ($1, $2, $3) returning id',
    'agent_user_profiles', 'insert into public.agent_user_profiles (tenant_id, contact_phone) values ($1, $3) returning id',
    'agent_runs', 'insert into public.agent_runs (tenant_id, agent_id, goal) values ($1, $2, $3) returning id',
    'social_publications', 'insert into public.social_publications (tenant_id, platform, post_type) values ($1, ''qa'', $3) returning id',
    'manus_tasks', 'insert into public.manus_tasks (tenant_id, task_id, prompt) values ($1, $3, $3) returning id',
    'agent_tools', 'insert into public.agent_tools (tenant_id, name, display_name) values ($1, $3, $3) returning id'
  );
  -- Tenant members manage these.
  v_manage text[] := array[
    'agent_evals', 'agent_eval_runs', 'agent_supervisors', 'agent_goals', 'agent_knowledge_folders',
    'agent_knowledge_items', 'agent_memory', 'agent_user_profiles', 'agent_tools'
  ];
  -- Tenant members only read these; edge functions write them with the service role.
  v_read_only text[] := array['agent_runs', 'social_publications'];
  v_tables text[] := v_manage || v_read_only || array['manus_tasks'];
  v_row_a jsonb := '{}';
  v_row_b jsonb := '{}';
  v_global_tool uuid;
  v_person uuid;
  v_t text;
  v_id uuid;
  v_rows integer;
  v_deletable boolean;
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
    (v_owner, v_a), (v_member, v_a), (v_outsider, v_b);
  INSERT INTO public.ai_agents (id, tenant_id, name) VALUES
    (v_agent_a, v_a, 'QA agent A'), (v_agent_b, v_b, 'QA agent B');
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE v_insert ->> v_t INTO v_id USING v_a, v_agent_a, 'qa-a-' || v_tag;
    v_row_a := v_row_a || jsonb_build_object(v_t, v_id);
    EXECUTE v_insert ->> v_t INTO v_id USING v_b, v_agent_b, 'qa-b-' || v_tag;
    v_row_b := v_row_b || jsonb_build_object(v_t, v_id);
  END LOOP;
  EXECUTE v_insert ->> 'agent_tools' INTO v_global_tool USING NULL::uuid, NULL::uuid, 'qa-global-' || v_tag;

  -- Tenant A's owner and member: read and manage A, see and change nothing of B.
  FOREACH v_person IN ARRAY ARRAY[v_owner, v_member] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_person::text, true);
    SET LOCAL ROLE authenticated;
    FOREACH v_t IN ARRAY v_tables LOOP
      EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING (v_row_a ->> v_t)::uuid;
      IF v_rows <> 1 THEN RAISE EXCEPTION '%: own tenant row is not readable (person %)', v_t, v_person; END IF;
      EXECUTE format('select count(*) from public.%I where id = $1', v_t) INTO v_rows USING (v_row_b ->> v_t)::uuid;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: another tenant row is readable (person %)', v_t, v_person; END IF;
      EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING (v_row_b ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: another tenant row is editable', v_t; END IF;
      EXECUTE format('delete from public.%I where id = $1', v_t) USING (v_row_b ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: another tenant row is deletable', v_t; END IF;
      BEGIN
        EXECUTE v_insert ->> v_t USING v_b, v_agent_b, 'qa-x-' || gen_random_uuid();
        RAISE EXCEPTION '%: a row can be created in another tenant', v_t;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END LOOP;

    FOREACH v_t IN ARRAY v_manage || array['manus_tasks'] LOOP
      EXECUTE v_insert ->> v_t INTO v_id USING v_a, v_agent_a, 'qa-m-' || gen_random_uuid();
      EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING v_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN RAISE EXCEPTION '%: own tenant row is not editable', v_t; END IF;
      BEGIN
        EXECUTE format('update public.%I set tenant_id = $2 where id = $1', v_t) USING v_id, v_b;
        RAISE EXCEPTION '%: a row can be moved to another tenant', v_t;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      -- Nothing deletes a Manus task, so that table has no delete rule.
      v_deletable := v_t <> 'manus_tasks';
      EXECUTE format('delete from public.%I where id = $1', v_t) USING v_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> v_deletable::integer THEN RAISE EXCEPTION '%: delete matched % rows', v_t, v_rows; END IF;
    END LOOP;

    FOREACH v_t IN ARRAY v_read_only LOOP
      BEGIN
        EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-r-' || gen_random_uuid();
        RAISE EXCEPTION '%: a member can create a row', v_t;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING (v_row_a ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: a member can edit a row', v_t; END IF;
      EXECUTE format('delete from public.%I where id = $1', v_t) USING (v_row_a ->> v_t)::uuid;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 0 THEN RAISE EXCEPTION '%: a member can delete a row', v_t; END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.agent_tools WHERE id = v_global_tool) THEN
      RAISE EXCEPTION 'agent_tools: a global tool is not readable';
    END IF;
    UPDATE public.agent_tools SET enabled = NOT enabled WHERE id = v_global_tool;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'agent_tools: a member can edit a global tool'; END IF;
    DELETE FROM public.agent_tools WHERE id = v_global_tool;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN RAISE EXCEPTION 'agent_tools: a member can delete a global tool'; END IF;
    BEGIN
      EXECUTE v_insert ->> 'agent_tools' USING NULL::uuid, NULL::uuid, 'qa-g-' || gen_random_uuid();
      RAISE EXCEPTION 'agent_tools: a member can create a global tool';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      INSERT INTO public.agent_batch_reports (batch_id) VALUES (gen_random_uuid());
      RAISE EXCEPTION 'agent_batch_reports: a member can write a service-only table';
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
  END LOOP;
  RESET ROLE;

  -- Super admin (no tenant): reads both tenants and manages any tenant's rows, but not global tools.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('select count(*) from public.%I where id in ($1, $2)', v_t)
      INTO v_rows USING (v_row_a ->> v_t)::uuid, (v_row_b ->> v_t)::uuid;
    IF v_rows <> 2 THEN RAISE EXCEPTION '%: super admin reads % of 2 rows', v_t, v_rows; END IF;
  END LOOP;
  FOREACH v_t IN ARRAY v_manage || array['manus_tasks'] LOOP
    EXECUTE v_insert ->> v_t INTO v_id USING v_b, v_agent_b, 'qa-s-' || gen_random_uuid();
    EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', v_t) USING v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION '%: super admin cannot edit a tenant row', v_t; END IF;
  END LOOP;
  UPDATE public.agent_tools SET enabled = NOT enabled WHERE id = v_global_tool;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'agent_tools: super admin can edit a global tool'; END IF;
  RESET ROLE;

  -- anon: reads nothing and creates nothing, in every table of the group.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('select count(*) from public.%I where id in ($1, $2, $3)', v_t)
      INTO v_rows USING (v_row_a ->> v_t)::uuid, (v_row_b ->> v_t)::uuid, v_global_tool;
    IF v_rows <> 0 THEN RAISE EXCEPTION '%: anon reads % rows', v_t, v_rows; END IF;
    BEGIN
      EXECUTE v_insert ->> v_t USING v_a, v_agent_a, 'qa-anon-' || gen_random_uuid();
      RAISE EXCEPTION '%: anon can create a row', v_t;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    EXECUTE v_insert ->> 'agent_tools' USING NULL::uuid, NULL::uuid, 'qa-anon-' || gen_random_uuid();
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
SELECT 'Agents studio: members read run logs and manage their tenant, other tenants see nothing, anon is denied' AS result;
ROLLBACK;
