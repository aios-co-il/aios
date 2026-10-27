-- Report sender lines (20261027104000_report_whatsapp_sender): synthetic lines
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
  v_stranger uuid;
  v_member_line uuid;
  v_forged uuid;
  v_schedule uuid;
  v_ids uuid[];
  v_chats text[];
  v_known_chat text := 'qa-known-' || gen_random_uuid() || '@g.us';
  v_other_chat text := 'qa-other-' || gen_random_uuid() || '@g.us';
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  SELECT id INTO v_other FROM public.tenants WHERE id <> v_tenant ORDER BY id LIMIT 1;
  SELECT id INTO v_client FROM public.clients ORDER BY id LIMIT 1;
  SELECT id INTO v_table FROM public.crm_tables ORDER BY id LIMIT 1;
  SELECT user_id INTO v_member FROM public.tenant_users WHERE tenant_id = v_tenant ORDER BY user_id LIMIT 1;
  SELECT u.id INTO v_stranger
  FROM auth.users AS u
  WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_users AS tu
      WHERE tu.tenant_id = v_tenant AND tu.user_id = u.id
    )
    AND NOT public.is_super_admin(u.id)
  ORDER BY u.id
  LIMIT 1;
  IF v_other IS NULL OR v_client IS NULL OR v_table IS NULL
     OR v_member IS NULL OR v_stranger IS NULL THEN
    RAISE EXCEPTION 'Requires two tenants, a client, a table, a member and a non-member';
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

  -- Own and shared lines are usable; another tenant's line, a row a
  -- non-member wrote into the tenant, and Meta are not.
  IF NOT public.report_whatsapp_sender_usable(v_tenant, v_own)
     OR NOT public.report_whatsapp_sender_usable(v_tenant, v_member_line)
     OR NOT public.report_whatsapp_sender_usable(v_tenant, v_shared)
     OR public.report_whatsapp_sender_usable(v_tenant, v_foreign)
     OR public.report_whatsapp_sender_usable(v_tenant, v_forged)
     OR public.report_whatsapp_sender_usable(v_tenant, v_meta) THEN
    RAISE EXCEPTION 'usable: own, member and shared only, never foreign, forged or Meta';
  END IF;

  -- The worker (service role) lists exactly the usable lines, without
  -- secrets, the tenant's own lines before the shared one, which says so.
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  SELECT array_agg(s.id ORDER BY s.ord) INTO v_ids
  FROM public.list_report_whatsapp_senders(v_tenant) WITH ORDINALITY AS s(
    id, integration_type, display_name, last4, owner_user_id, owner_name,
    owner_tenant_id, owner_tenant_name, is_shared, carmen_role, ready,
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
    FROM public.list_report_whatsapp_senders(v_tenant) AS s
    WHERE s.id IN (v_own, v_member_line, v_shared)
      AND s.is_shared IS DISTINCT FROM (s.id = v_shared)
  ) THEN
    RAISE EXCEPTION 'list: only the line of another tenant is_shared';
  END IF;
  -- Group ids come back only for this tenant's own groups.
  SELECT s.group_chat_ids INTO v_chats
  FROM public.list_report_whatsapp_senders(v_tenant) AS s
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
  PERFORM set_config('request.jwt.claims', '', true);

  -- A schedule may name an own or shared line, never another tenant's.
  INSERT INTO public.report_schedules (tenant_id, client_id, target_type, table_id, whatsapp_integration_id)
  VALUES (v_tenant, v_client, 'table', v_table, v_shared)
  RETURNING id INTO v_schedule;
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
     OR has_function_privilege('authenticated', 'public.report_whatsapp_sender_usable(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.can_manage_report_settings(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.list_report_whatsapp_senders(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_report_whatsapp_sender(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: browsers must not write settings or call internal checks';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.list_report_whatsapp_senders(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.set_report_whatsapp_sender(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: members must list lines and owners set the default';
  END IF;
END
$test$;
ROLLBACK;
