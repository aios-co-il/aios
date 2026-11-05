-- The workshop chat's mode toggle (20261105150000_workshop_autonomy_mode): synthetic work items
-- inside one transaction that is rolled back, signed in as a tenant member (authenticated role).
-- The mode is stored on the project's payload and nothing else changes; an unknown mode, an
-- unknown project and another tenant's project are refused until the member joins that tenant;
-- anon cannot call it.
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_item uuid;
  v_other_tenant uuid;
  v_other_item uuid;
  v_payload jsonb;
  v_failed boolean;
BEGIN
  SELECT tu.user_id, tu.tenant_id INTO v_actor, v_tenant
  FROM public.tenant_users tu
  WHERE public.get_user_tenant_id(tu.user_id) = tu.tenant_id
    AND NOT public.is_super_admin(tu.user_id)
  LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Requires a non-admin tenant member'; END IF;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_tenant, 'QA ROLLBACK set mode', 'draft', '{"project_type":"video","workshop_budget":{"cap_usd":5}}')
  RETURNING id INTO v_item;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK set mode other', 'qa-set-mode-other-' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_other_tenant;
  INSERT INTO public.marketing_work_items (tenant_id, title, status, payload)
  VALUES (v_other_tenant, 'QA ROLLBACK set mode other', 'draft', '{}')
  RETURNING id INTO v_other_item;

  IF has_function_privilege('anon', 'public.workshop_set_mode(uuid, text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not call workshop_set_mode';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SET LOCAL ROLE authenticated;

  -- The mode is stored and returned; the rest of the payload stays.
  IF public.workshop_set_mode(v_item, 'auto') <> 'auto' THEN
    RAISE EXCEPTION 'auto should be returned';
  END IF;
  IF public.workshop_set_mode(v_item, 'semi') <> 'semi' THEN
    RAISE EXCEPTION 'semi should be returned';
  END IF;
  PERFORM public.workshop_set_mode(v_item, 'auto');
  RESET ROLE;
  SELECT payload INTO v_payload FROM public.marketing_work_items WHERE id = v_item;
  IF v_payload->>'workshop_mode' <> 'auto' OR v_payload->>'project_type' <> 'video'
     OR (v_payload->'workshop_budget'->>'cap_usd')::numeric <> 5 THEN
    RAISE EXCEPTION 'only the mode should change (%)', v_payload;
  END IF;
  SET LOCAL ROLE authenticated;

  -- An unknown mode and an unknown project are refused.
  BEGIN
    PERFORM public.workshop_set_mode(v_item, 'turbo');
    v_failed := false;
  EXCEPTION WHEN invalid_parameter_value THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown mode must be refused'; END IF;
  BEGIN
    PERFORM public.workshop_set_mode(gen_random_uuid(), 'auto');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown project must be refused'; END IF;

  -- Another tenant's project is "not found" and unchanged.
  BEGIN
    PERFORM public.workshop_set_mode(v_other_item, 'auto');
    v_failed := false;
  EXCEPTION WHEN no_data_found THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'another tenant''s project must be refused'; END IF;
  RESET ROLE;
  IF (SELECT payload ? 'workshop_mode' FROM public.marketing_work_items WHERE id = v_other_item) THEN
    RAISE EXCEPTION 'another tenant''s project must stay unchanged';
  END IF;

  -- A member of that tenant too (not their active one) sets its mode.
  INSERT INTO public.tenant_users (user_id, tenant_id, role) VALUES (v_actor, v_other_tenant, 'member');
  SET LOCAL ROLE authenticated;
  IF public.workshop_set_mode(v_other_item, 'auto') <> 'auto' THEN
    RAISE EXCEPTION 'a member of the second tenant should set its mode';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE 'workshop_set_mode: all checks passed';
END;
$test$;
ROLLBACK;
