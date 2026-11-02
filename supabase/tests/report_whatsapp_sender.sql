-- Report sender lines (20261030094000_report_whatsapp_sender): synthetic lines
-- in two tenants inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_other uuid;
  v_client uuid;
  v_table uuid;
  v_own uuid;
  v_shared uuid;
  v_foreign uuid;
  v_meta uuid;
  v_member uuid;
  v_colleague uuid;
  v_manager uuid;
  v_stranger uuid;
  v_admin uuid;
  v_member_line uuid;
  v_colleague_line uuid;
  v_forged uuid;
  v_schedule uuid;
  v_ids uuid[];
  v_chats text[];
  v_known_chat text := 'qa-known-' || gen_random_uuid() || '@g.us';
  v_other_chat text := 'qa-other-' || gen_random_uuid() || '@g.us';
BEGIN
  -- The two members are not super admins, who may use every line of a tenant.
  SELECT tu.tenant_id INTO v_tenant
  FROM public.tenant_users AS tu
  WHERE NOT public.is_super_admin(tu.user_id)
  GROUP BY tu.tenant_id
  HAVING count(*) >= 2
  ORDER BY tu.tenant_id
  LIMIT 1;
  SELECT id INTO v_other FROM public.tenants WHERE id <> v_tenant ORDER BY id LIMIT 1;
  SELECT id INTO v_client FROM public.clients ORDER BY id LIMIT 1;
  SELECT id INTO v_table FROM public.crm_tables ORDER BY id LIMIT 1;
  SELECT user_id INTO v_member
  FROM public.tenant_users
  WHERE tenant_id = v_tenant AND NOT public.is_super_admin(user_id)
  ORDER BY user_id
  LIMIT 1;
  SELECT user_id INTO v_colleague
  FROM public.tenant_users
  WHERE tenant_id = v_tenant
    AND user_id <> v_member
    AND NOT public.is_super_admin(user_id)
  ORDER BY user_id
  LIMIT 1;
  SELECT u.id INTO v_admin
  FROM auth.users AS u
  WHERE public.is_super_admin(u.id)
  ORDER BY u.id
  LIMIT 1;
  SELECT u.id INTO v_manager
  FROM auth.users AS u
  WHERE public.can_manage_report_settings(v_tenant, u.id)
  ORDER BY u.id
  LIMIT 1;
  SELECT u.id INTO v_stranger
  FROM auth.users AS u
  WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_users AS tu
      WHERE tu.tenant_id = v_tenant AND tu.user_id = u.id
    )
    AND NOT public.is_super_admin(u.id)
  ORDER BY u.id
  LIMIT 1;
  IF v_tenant IS NULL OR v_other IS NULL OR v_client IS NULL OR v_table IS NULL
     OR v_colleague IS NULL OR v_manager IS NULL OR v_stranger IS NULL THEN
    RAISE EXCEPTION 'Requires a tenant with two members and a report-settings manager, a second tenant, a client, a table and a non-member';
  END IF;

  -- The earlier signatures are gone: next to the current ones, the
  -- browser's list call with p_tenant_id alone would be ambiguous.
  IF to_regprocedure('public.report_whatsapp_sender_usable(uuid, uuid)') IS NOT NULL
     OR to_regprocedure('public.list_report_whatsapp_senders(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'overloads: the earlier signatures must be dropped';
  END IF;

  -- Carmen's line has synced two groups; only one is a group of this tenant.
  INSERT INTO public.whatsapp_groups (tenant_id, group_chat_id, group_name)
  VALUES (v_tenant, v_known_chat, 'qa group');
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, api_key, settings)
  VALUES (
    v_tenant, 'manus_wa', true, 'qa-key',
    jsonb_build_object(
      'instance_id', 'qa-own',
      'manus_groups_sync', jsonb_build_object('group_chat_ids', jsonb_build_array(v_known_chat, v_other_chat))
    )
  )
  RETURNING id INTO v_own;
  -- A member's own line keeps the column default: private.
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, is_active, api_key, settings)
  VALUES (v_tenant, v_member, 'green_api', true, 'qa-key', '{"instance_id": "qa-member"}')
  RETURNING id INTO v_member_line;
  -- Any signed-in user can write a row with any tenant_id (AIO-245): a line
  -- whose owner is not a member of that tenant is not the tenant's line.
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, is_active, api_key, settings)
  VALUES (v_tenant, v_stranger, 'manus_wa', true, 'qa-key', '{"instance_id": "qa-forged"}')
  RETURNING id INTO v_forged;
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, api_key, settings)
  VALUES (v_other, 'green_api', true, 'qa-key', '{"instance_id": "qa-shared"}')
  RETURNING id INTO v_shared;
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, api_key, settings)
  VALUES (v_other, 'green_api', true, 'qa-key', '{"instance_id": "qa-foreign"}')
  RETURNING id INTO v_foreign;
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, is_active, api_key, settings)
  VALUES (v_tenant, 'meta_whatsapp', true, 'qa-key', '{"phone_number_id": "qa-meta"}')
  RETURNING id INTO v_meta;
  INSERT INTO public.integration_tenant_access (integration_id, accessing_tenant_id)
  VALUES (v_shared, v_tenant);

  -- The organization line and the shared line serve every member; another
  -- tenant's line, a row a non-member wrote into the tenant, and Meta serve
  -- no one.
  IF NOT public.report_whatsapp_sender_usable(v_tenant, v_own, v_colleague)
     OR NOT public.report_whatsapp_sender_usable(v_tenant, v_own, NULL)
     OR NOT public.report_whatsapp_sender_usable(v_tenant, v_shared, v_colleague)
     OR NOT public.report_whatsapp_sender_usable(v_tenant, v_shared, NULL)
     OR public.report_whatsapp_sender_usable(v_tenant, v_foreign, v_member)
     OR public.report_whatsapp_sender_usable(v_tenant, v_forged, v_stranger)
     OR public.report_whatsapp_sender_usable(v_tenant, v_meta, v_member) THEN
    RAISE EXCEPTION 'usable: organization and shared lines for everyone, never foreign, forged or Meta';
  END IF;

  -- A member's private line serves only its owner: another member of the
  -- tenant may not send from it, and it cannot be the default.
  IF NOT public.report_whatsapp_sender_usable(v_tenant, v_member_line, v_member)
     OR public.report_whatsapp_sender_usable(v_tenant, v_member_line, v_colleague)
     OR public.report_whatsapp_sender_usable(v_tenant, v_member_line, NULL) THEN
    RAISE EXCEPTION 'usable: a private line serves its owner only';
  END IF;

  -- A super admin may use it, as user_has_integration_permission allows.
  IF v_admin IS NOT NULL
     AND NOT public.report_whatsapp_sender_usable(v_tenant, v_member_line, v_admin) THEN
    RAISE EXCEPTION 'usable: a super admin may use every line of the tenant';
  END IF;

  -- Shared with specific users, a grant opens it to that member alone; a
  -- grant left over after it went back to private opens nothing. Opening it
  -- to the organization opens it to everyone.
  UPDATE public.tenant_integrations SET connection_visibility = 'shared' WHERE id = v_member_line;
  INSERT INTO public.integration_user_permissions (integration_id, user_id, granted_by)
  VALUES (v_member_line, v_colleague, v_member);
  IF NOT public.report_whatsapp_sender_usable(v_tenant, v_member_line, v_colleague)
     OR public.report_whatsapp_sender_usable(v_tenant, v_member_line, NULL) THEN
    RAISE EXCEPTION 'usable: a granted line serves the granted member, not everyone';
  END IF;
  UPDATE public.tenant_integrations SET connection_visibility = 'private' WHERE id = v_member_line;
  IF public.report_whatsapp_sender_usable(v_tenant, v_member_line, v_colleague) THEN
    RAISE EXCEPTION 'usable: a grant on a private line must not count';
  END IF;
  DELETE FROM public.integration_user_permissions WHERE integration_id = v_member_line;
  UPDATE public.tenant_integrations SET connection_visibility = 'org' WHERE id = v_member_line;
  IF NOT public.report_whatsapp_sender_usable(v_tenant, v_member_line, v_colleague)
     OR NOT public.report_whatsapp_sender_usable(v_tenant, v_member_line, NULL) THEN
    RAISE EXCEPTION 'usable: a line opened to the organization serves everyone';
  END IF;
  UPDATE public.tenant_integrations SET connection_visibility = 'private' WHERE id = v_member_line;

  -- The worker (service role) lists the lines a schedule's creator may use,
  -- without secrets, the tenant's own lines before the shared one, which
  -- says so.
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  SELECT array_agg(s.id ORDER BY s.ord) INTO v_ids
  FROM public.list_report_whatsapp_senders(v_tenant, v_member) WITH ORDINALITY AS s(
    id, integration_type, display_name, last4, owner_user_id, owner_name,
    owner_tenant_id, owner_tenant_name, is_shared, org_wide, carmen_role, ready,
    group_chat_ids, caller_can_manage, ord
  )
  WHERE s.id IN (v_own, v_member_line, v_shared, v_foreign, v_forged, v_meta);
  IF v_ids IS NULL
     OR NOT (v_ids @> ARRAY[v_own, v_member_line, v_shared] AND cardinality(v_ids) = 3)
     OR v_ids[3] <> v_shared THEN
    RAISE EXCEPTION 'list: expected the own and member lines, then the shared one, got %', v_ids;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.list_report_whatsapp_senders(v_tenant, v_member) AS s
    WHERE s.id IN (v_own, v_member_line, v_shared)
      AND (
        s.is_shared IS DISTINCT FROM (s.id = v_shared)
        OR s.org_wide IS DISTINCT FROM (s.id <> v_member_line)
      )
  ) THEN
    RAISE EXCEPTION 'list: only the line of another tenant is_shared; only the private line is not org_wide';
  END IF;
  -- Another member never gets the private line.
  SELECT array_agg(s.id) INTO v_ids
  FROM public.list_report_whatsapp_senders(v_tenant, v_colleague) AS s
  WHERE s.id IN (v_own, v_member_line, v_shared);
  IF v_ids IS NULL
     OR NOT (v_ids @> ARRAY[v_own, v_shared] AND cardinality(v_ids) = 2) THEN
    RAISE EXCEPTION 'list: another member must not get the private line, got %', v_ids;
  END IF;
  -- Group ids come back only for this tenant's own groups.
  SELECT s.group_chat_ids INTO v_chats
  FROM public.list_report_whatsapp_senders(v_tenant, v_member) AS s
  WHERE s.id = v_own;
  IF v_chats IS DISTINCT FROM ARRAY[v_known_chat] THEN
    RAISE EXCEPTION 'list: group ids must be this tenant''s groups only, got %', v_chats;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.routines AS r
    JOIN information_schema.parameters AS p ON p.specific_name = r.specific_name
    WHERE r.routine_schema = 'public'
      AND r.routine_name = 'list_report_whatsapp_senders'
      AND p.parameter_name IN ('api_key', 'instance_id')
  ) THEN
    RAISE EXCEPTION 'list: must not return credentials';
  END IF;

  -- A member lists their own lines and may not ask for another member's.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_colleague)::text,
    true
  );
  IF EXISTS (
    SELECT 1
    FROM public.list_report_whatsapp_senders(v_tenant) AS s
    WHERE s.id = v_member_line
  ) THEN
    RAISE EXCEPTION 'list: a member must not see another member''s private line';
  END IF;
  BEGIN
    PERFORM public.list_report_whatsapp_senders(v_tenant, v_member);
    RAISE EXCEPTION 'list: a member must not list another member''s lines';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- A non-member gets nothing.
  PERFORM set_config('request.jwt.claims', '{"role": "authenticated", "sub": "00000000-0000-0000-0000-000000000000"}', true);
  BEGIN
    PERFORM public.list_report_whatsapp_senders(v_tenant);
    RAISE EXCEPTION 'list: a non-member must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.set_report_whatsapp_sender(v_tenant, v_own);
    RAISE EXCEPTION 'set: a non-owner must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- The default serves every member: a private line is refused, the
  -- organization line is taken.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_manager)::text,
    true
  );
  BEGIN
    PERFORM public.set_report_whatsapp_sender(v_tenant, v_member_line);
    RAISE EXCEPTION 'set: a private line must not become the default';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  PERFORM public.set_report_whatsapp_sender(v_tenant, v_own);
  PERFORM set_config('request.jwt.claims', '', true);

  -- A member's insert records that member as the creator, whoever it names.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_member)::text,
    true
  );
  INSERT INTO public.report_schedules (tenant_id, client_id, target_type, table_id, whatsapp_integration_id, created_by)
  VALUES (v_tenant, v_client, 'table', v_table, v_shared, v_colleague)
  RETURNING id INTO v_schedule;
  IF (SELECT created_by FROM public.report_schedules WHERE id = v_schedule) IS DISTINCT FROM v_member THEN
    RAISE EXCEPTION 'creator: a member''s insert must record that member';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- A schedule may name a line its creator may use, never another member's
  -- private line or another tenant's line.
  BEGIN
    UPDATE public.report_schedules
    SET whatsapp_integration_id = v_member_line, created_by = v_colleague
    WHERE id = v_schedule;
    RAISE EXCEPTION 'schedule: another member''s private line must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  UPDATE public.report_schedules
  SET whatsapp_integration_id = v_member_line, created_by = v_member
  WHERE id = v_schedule;
  BEGIN
    UPDATE public.report_schedules SET whatsapp_integration_id = v_foreign WHERE id = v_schedule;
    RAISE EXCEPTION 'schedule: a foreign line must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    UPDATE public.report_schedules SET whatsapp_integration_id = v_forged WHERE id = v_schedule;
    RAISE EXCEPTION 'schedule: a line written by a non-member must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  UPDATE public.report_schedules SET whatsapp_integration_id = v_shared WHERE id = v_schedule;

  -- A colleague may leave the member's enabled schedule sending only from a
  -- line the colleague may use too: never point it at the member's private
  -- line, nor change its recipient while it sends from that line or from
  -- the member's own line through a NULL with no default.
  UPDATE public.report_schedules SET enabled = true WHERE id = v_schedule;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_colleague)::text,
    true
  );
  BEGIN
    UPDATE public.report_schedules
    SET whatsapp_integration_id = v_member_line, phone = '+972500000001', message = 'qa colleague'
    WHERE id = v_schedule;
    RAISE EXCEPTION 'colleague: must not point a member''s schedule at the member''s private line';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  UPDATE public.report_schedules SET phone = '+972500000001' WHERE id = v_schedule;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.report_schedules SET whatsapp_integration_id = v_member_line WHERE id = v_schedule;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_colleague)::text,
    true
  );
  BEGIN
    UPDATE public.report_schedules SET phone = '+972500000002' WHERE id = v_schedule;
    RAISE EXCEPTION 'colleague: must not edit a schedule that sends from a member''s private line';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  -- The default (the organization line) serves the colleague too.
  UPDATE public.report_schedules SET whatsapp_integration_id = NULL WHERE id = v_schedule;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.tenant_report_settings SET whatsapp_integration_id = NULL WHERE tenant_id = v_tenant;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_colleague)::text,
    true
  );
  BEGIN
    UPDATE public.report_schedules SET phone = '+972500000002' WHERE id = v_schedule;
    RAISE EXCEPTION 'colleague: a NULL line with no default must not pass';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  -- Deleting a line clears it from a member's schedule through the foreign
  -- key, which its owner may always do.
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, is_active, api_key, settings, connection_visibility)
  VALUES (v_tenant, v_colleague, 'green_api', true, 'qa-key', '{"instance_id": "qa-colleague"}', 'org')
  RETURNING id INTO v_colleague_line;
  UPDATE public.report_schedules SET whatsapp_integration_id = v_colleague_line WHERE id = v_schedule;
  DELETE FROM public.tenant_integrations WHERE id = v_colleague_line;

  -- Switching it off stays open to the colleague, and the member edits it.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.report_schedules SET whatsapp_integration_id = v_member_line WHERE id = v_schedule;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_colleague)::text,
    true
  );
  UPDATE public.report_schedules SET enabled = false WHERE id = v_schedule;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_member)::text,
    true
  );
  UPDATE public.report_schedules SET enabled = true, phone = '+972500000003' WHERE id = v_schedule;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.report_schedules
  SET whatsapp_integration_id = v_shared, enabled = false
  WHERE id = v_schedule;

  -- The worker sends as the creator, so a member never names another one:
  -- naming the owner of a private line does not open it, and an update
  -- keeps the creator. The service role may change it.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_colleague)::text,
    true
  );
  BEGIN
    INSERT INTO public.report_schedules (tenant_id, client_id, target_type, table_id, whatsapp_integration_id, created_by)
    VALUES (v_tenant, v_client, 'table', v_table, v_member_line, v_member)
    ON CONFLICT DO NOTHING;
    RAISE EXCEPTION 'creator: naming another member must not open their private line';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  UPDATE public.report_schedules SET created_by = v_colleague WHERE id = v_schedule;
  UPDATE public.report_schedules SET created_by = NULL WHERE id = v_schedule;
  IF (SELECT created_by FROM public.report_schedules WHERE id = v_schedule) IS DISTINCT FROM v_member THEN
    RAISE EXCEPTION 'creator: a member must not change the creator';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  UPDATE public.report_schedules SET created_by = v_colleague WHERE id = v_schedule;
  IF (SELECT created_by FROM public.report_schedules WHERE id = v_schedule) IS DISTINCT FROM v_colleague THEN
    RAISE EXCEPTION 'creator: the service role may change the creator';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- A line switched off later does not block editing or disabling the schedule.
  UPDATE public.tenant_integrations SET is_active = false WHERE id = v_shared;
  UPDATE public.report_schedules SET enabled = false WHERE id = v_schedule;

  -- Deleting a line clears it from schedules and defaults.
  DELETE FROM public.tenant_integrations WHERE id = v_shared;
  IF (SELECT whatsapp_integration_id FROM public.report_schedules WHERE id = v_schedule) IS NOT NULL THEN
    RAISE EXCEPTION 'schedule: a deleted line must fall back to the default';
  END IF;

  -- Browsers read settings through RLS and write only through the RPC.
  IF has_table_privilege('authenticated', 'public.tenant_report_settings', 'INSERT')
     OR has_table_privilege('authenticated', 'public.tenant_report_settings', 'UPDATE')
     OR has_function_privilege('authenticated', 'public.report_whatsapp_sender_usable(uuid, uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.can_manage_report_settings(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.list_report_whatsapp_senders(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_report_whatsapp_sender(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: browsers must not write settings or call internal checks';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.list_report_whatsapp_senders(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_report_whatsapp_sender(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: members must list lines and owners set the default';
  END IF;
END
$test$;
ROLLBACK;
