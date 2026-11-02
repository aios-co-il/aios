-- Saved Leads-screen default (20261102140000_lead_list_defaults): Staging
-- only. A member of two tenants and a member of one save defaults inside one
-- transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_user uuid;
  v_other_user uuid;
  v_tenant uuid;
  v_second_tenant uuid;
  v_foreign_tenant uuid;
  v_scope text;
  v_count integer;
BEGIN
  -- A non super admin who belongs to two tenants, and a member of the first
  -- tenant who is someone else.
  SELECT tu.user_id, min(tu.tenant_id::text)::uuid, max(tu.tenant_id::text)::uuid
  INTO v_user, v_tenant, v_second_tenant
  FROM public.tenant_users AS tu
  WHERE NOT public.is_super_admin(tu.user_id)
  GROUP BY tu.user_id
  HAVING count(DISTINCT tu.tenant_id) >= 2
  LIMIT 1;

  SELECT tu.user_id INTO v_other_user
  FROM public.tenant_users AS tu
  WHERE tu.tenant_id = v_tenant
    AND tu.user_id <> v_user
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;

  SELECT t.id INTO v_foreign_tenant
  FROM public.tenants AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_users AS tu
    WHERE tu.tenant_id = t.id AND tu.user_id = v_user
  )
  LIMIT 1;

  IF v_user IS NULL OR v_other_user IS NULL OR v_foreign_tenant IS NULL THEN
    RAISE EXCEPTION 'Fixture missing: need a two-tenant member, a colleague and a foreign tenant';
  END IF;

  -- Only 'all' and 'new' are valid scopes.
  BEGIN
    INSERT INTO public.lead_list_defaults (tenant_id, user_id, stage_scope)
    VALUES (v_tenant, v_user, 'kanban');
    RAISE EXCEPTION 'stage_scope accepted a value other than all or new';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- anon has no access at all.
  IF has_table_privilege('anon', 'public.lead_list_defaults', 'SELECT')
     OR has_table_privilege('anon', 'public.lead_list_defaults', 'INSERT')
     OR has_table_privilege('authenticated', 'public.lead_list_defaults', 'DELETE') THEN
    RAISE EXCEPTION 'lead_list_defaults grants are wider than select/insert/update for authenticated';
  END IF;

  -- The user saves a different default per tenant, and the upsert the app
  -- sends replaces it in place.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.lead_list_defaults (tenant_id, user_id, stage_scope)
  VALUES (v_tenant, v_user, 'new'), (v_second_tenant, v_user, 'all');

  INSERT INTO public.lead_list_defaults (tenant_id, user_id, stage_scope)
  VALUES (v_tenant, v_user, 'all')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET stage_scope = excluded.stage_scope;

  SELECT d.stage_scope INTO v_scope
  FROM public.lead_list_defaults AS d
  WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
  IF v_scope IS DISTINCT FROM 'all' THEN
    RAISE EXCEPTION 'The upsert did not replace the saved default (got %)', v_scope;
  END IF;

  -- Never as a colleague, and never in a tenant the user is not in.
  BEGIN
    INSERT INTO public.lead_list_defaults (tenant_id, user_id, stage_scope)
    VALUES (v_tenant, v_other_user, 'new');
    RAISE EXCEPTION 'A user saved a default for a colleague';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.lead_list_defaults (tenant_id, user_id, stage_scope)
    VALUES (v_foreign_tenant, v_user, 'new');
    RAISE EXCEPTION 'A user saved a default in a tenant they are not in';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.lead_list_defaults AS d
    SET tenant_id = v_foreign_tenant
    WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
    RAISE EXCEPTION 'A user moved their default to a tenant they are not in';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A colleague sees none of the user's defaults.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count
  FROM public.lead_list_defaults AS d
  WHERE d.user_id = v_user;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'A colleague can read another user''s default';
  END IF;

  RAISE NOTICE 'lead_list_defaults: all checks passed';
END;
$test$;
ROLLBACK;
