-- Carmen report recipients (20261027105000_carmen_report_recipients):
-- synthetic rows inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_agency uuid;
  v_outsider uuid;
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

  -- A client's phone is never a recipient.
  INSERT INTO public.clients (tenant_id, agency_id, name, phone)
  VALUES (v_tenant, v_agency, 'QA ROLLBACK client', '059-999-9904');
  BEGIN
    INSERT INTO public.carmen_report_recipients (tenant_id, phone, label)
    VALUES (v_tenant, '+972599999904', 'QA');
    RAISE EXCEPTION 'guard: a client phone must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

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

  -- Browsers: no anon access, no updates, and the staff list only via the RPC check.
  IF has_table_privilege('anon', 'public.carmen_report_recipients', 'SELECT')
     OR has_table_privilege('authenticated', 'public.carmen_report_recipients', 'UPDATE')
     OR has_function_privilege('anon', 'public.carmen_report_staff(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: anon must not read and members must not update recipients';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.carmen_report_recipients', 'INSERT')
     OR NOT has_function_privilege('authenticated', 'public.carmen_report_staff(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: owners must be able to add recipients and list staff';
  END IF;

  -- The service role (no signed-in user) lists the staff; a stranger may not.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM * FROM public.carmen_report_staff(v_tenant);
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
END
$test$;
ROLLBACK;
