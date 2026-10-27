-- Carmen report recipients (20261027105000_carmen_report_recipients):
-- synthetic rows inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_agency uuid;
  v_client uuid;
  v_other_tenant uuid;
  v_outsider uuid;
  v_inactive uuid;
  v_owner uuid;
  v_manager uuid;
  v_other_owner uuid;
  v_row uuid;
  v_rows integer;
BEGIN
  SELECT tenant_id, id INTO v_tenant, v_agency FROM public.agencies ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant with an agency'; END IF;

  -- An extra phone is stored once per organization.
  INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
  VALUES (v_tenant, '+972599999901', 'QA ROLLBACK');
  INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
  VALUES (v_tenant, '+972599999901', 'QA ROLLBACK again')
  ON CONFLICT (tenant_id, phone) DO NOTHING;
  SELECT count(*) INTO v_rows FROM public.carmen_report_recipients
  WHERE tenant_id = v_tenant AND phone = '+972599999901';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'dedupe: expected one row, got %', v_rows; END IF;

  -- A phone that is not E.164, or has no label, is refused.
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '0599999902', 'QA');
    RAISE EXCEPTION 'e164: a local number must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone)
    VALUES (v_tenant, '+972599999903');
    RAISE EXCEPTION 'label: an extra phone without a label must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A client's phone, or a client contact's phone, is never a recipient.
  INSERT INTO public.clients (tenant_id, agency_id, name, phone)
  VALUES (v_tenant, v_agency, 'QA ROLLBACK client', '059-999-9904')
  RETURNING id INTO v_client;
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999904', 'QA');
    RAISE EXCEPTION 'guard: a client phone must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.client_contacts (client_id, tenant_id, contact_name, phone)
  VALUES (v_client, v_tenant, 'QA ROLLBACK contact', '059-999-9905');
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999905', 'QA');
    RAISE EXCEPTION 'guard: a client contact phone must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A listed phone that later becomes a client contact's is reported to every send.
  INSERT INTO public.client_contacts (client_id, tenant_id, contact_name, phone)
  VALUES (v_client, v_tenant, 'QA ROLLBACK late contact', '+972599999901');
  IF NOT EXISTS (
    SELECT 1 FROM public.carmen_report_client_phones(v_tenant) p
    WHERE p = '+972599999901'
  ) THEN
    RAISE EXCEPTION 'send check: a listed phone that became a client must be reported';
  END IF;

  -- A user without a role in the organization is refused.
  SELECT p.id INTO v_outsider FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.tenant_id = v_tenant
  )
  LIMIT 1;
  IF v_outsider IS NOT NULL THEN
    BEGIN
      INSERT INTO public.carmen_report_recipients (tenant_id, user_id)
      VALUES (v_tenant, v_outsider);
      RAISE EXCEPTION 'guard: a non-staff user must be refused';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END IF;

  -- An inactive profile is not staff Carmen reports to.
  SELECT p.id INTO v_inactive FROM public.profiles p
  WHERE p.status = 'inactive'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.tenant_id = v_tenant
    )
  LIMIT 1;
  IF v_inactive IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_inactive, v_tenant, 'owner');
    IF EXISTS (
      SELECT 1 FROM public.carmen_report_staff_rows(v_tenant) s
      WHERE s.user_id = v_inactive
    ) THEN
      RAISE EXCEPTION 'staff: an inactive profile must not be listed';
    END IF;
  END IF;

  -- Browsers: no anon access, no updates, and the internal checks stay server-side.
  IF has_table_privilege('anon', 'public.carmen_report_recipients', 'SELECT')
     OR has_table_privilege('authenticated', 'public.carmen_report_recipients', 'UPDATE')
     OR has_function_privilege('anon', 'public.carmen_report_staff(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carmen_report_client_phones(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_report_staff_rows(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.carmen_is_client_phone(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: anon must not read, members must not update, internal checks stay server-side';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.carmen_report_recipients', 'INSERT')
     OR NOT has_function_privilege('authenticated', 'public.carmen_report_staff(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.carmen_report_client_phones(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: owners must be able to add recipients, list staff and see client phones on the list';
  END IF;

  -- The service role (no signed-in user) lists the staff and the client
  -- phones on the list; a stranger may not.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM * FROM public.carmen_report_staff(v_tenant);
  PERFORM * FROM public.carmen_report_client_phones(v_tenant);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text,
    true
  );
  BEGIN
    PERFORM * FROM public.carmen_report_staff(v_tenant);
    RAISE EXCEPTION 'staff: a non-owner must not list the staff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.carmen_report_client_phones(v_tenant);
    RAISE EXCEPTION 'client phones: a non-owner must not check the list';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Signed-in users (synthetic roles): an owner of this organization, its team
  -- manager, and an owner of another organization.
  SELECT id INTO v_other_tenant FROM public.tenants WHERE id <> v_tenant LIMIT 1;
  SELECT p.id INTO v_owner FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.tenant_id = v_tenant)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = p.id AND tu.tenant_id = v_tenant)
    AND p.status IS DISTINCT FROM 'inactive'
  ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_manager FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.tenant_id = v_tenant)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = p.id AND tu.tenant_id = v_tenant)
    AND p.status IS DISTINCT FROM 'inactive'
    AND p.id <> v_owner
  ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_other_owner FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.tenant_id = v_tenant)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = p.id AND tu.tenant_id = v_tenant)
    AND p.id NOT IN (v_owner, v_manager)
  ORDER BY p.id LIMIT 1;
  IF v_other_tenant IS NULL OR v_other_owner IS NULL THEN
    RAISE EXCEPTION 'Requires a second tenant and three profiles outside the first';
  END IF;
  INSERT INTO public.user_roles (user_id, tenant_id, role) VALUES
    (v_owner, v_tenant, 'owner'),
    (v_manager, v_tenant, 'team_manager'),
    (v_other_owner, v_other_tenant, 'owner');

  -- Another organization's owner learns nothing: refused before the client
  -- and staff checks, and reads no rows.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_other_owner)::text,
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999904', 'QA probe');
    RAISE EXCEPTION 'rls: another owner must not probe client phones';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, user_id)
    VALUES (v_tenant, v_other_owner);
    RAISE EXCEPTION 'rls: another owner must not probe staff';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_rows FROM public.carmen_report_recipients
  WHERE tenant_id = v_tenant;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'rls: another owner read % rows', v_rows; END IF;
  BEGIN
    PERFORM * FROM public.carmen_report_client_phones(v_tenant);
    RAISE EXCEPTION 'client phones: another owner must not check the list';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A team manager of the organization reads the list but cannot change it.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_manager)::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_report_recipients
  WHERE tenant_id = v_tenant AND phone = '+972599999901';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'rls: staff must read the list'; END IF;
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999906', 'QA manager');
    RAISE EXCEPTION 'rls: a team manager must not add recipients';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.carmen_report_recipients WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'rls: a team manager deleted % rows', v_rows; END IF;
  RESET ROLE;

  -- The organization's owner adds and removes recipients, is told when a
  -- phone belongs to a client, and sees a listed phone that became one.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_owner)::text,
    true
  );
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (
    SELECT 1 FROM public.carmen_report_client_phones(v_tenant) p
    WHERE p = '+972599999901'
  ) THEN
    RAISE EXCEPTION 'client phones: the owner must see a listed phone that became a client';
  END IF;
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999904', 'QA owner');
    RAISE EXCEPTION 'guard: the owner must be refused a client phone';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.carmen_report_recipients (tenant_id, user_id)
  VALUES (v_tenant, v_manager)
  ON CONFLICT (tenant_id, user_id) DO NOTHING
  RETURNING id INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'rls: the owner must add a staff member'; END IF;
  DELETE FROM public.carmen_report_recipients WHERE id = v_row AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'rls: the owner must remove a recipient'; END IF;
  RESET ROLE;

  -- A super admin reads every organization's list (TENANT_ISOLATION.md) but
  -- writes none of it.
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_other_owner, NULL, 'super_admin');
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_other_owner)::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_rows FROM public.carmen_report_recipients
  WHERE tenant_id = v_tenant AND phone = '+972599999901';
  IF v_rows <> 1 THEN RAISE EXCEPTION 'rls: a super admin must read the list'; END IF;
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999907', 'QA super admin');
    RAISE EXCEPTION 'rls: a super admin must not add recipients';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END
$test$;
SELECT 'Report recipients: guard, send check, client phones, grants and RLS passed' AS result;
ROLLBACK;
