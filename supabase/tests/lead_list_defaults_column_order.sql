-- CRM column order on the Leads-screen default
-- (20261119130000_lead_list_defaults_column_order): a user saves a column order
-- without a stage scope, the column order and the stage scope update without
-- clearing each other, and a colleague neither reads nor changes the user's
-- order. Synthetic users and tenants inside one transaction that is rolled back.
BEGIN;

-- Signs in as the user; the caller then switches to the authenticated role.
CREATE FUNCTION pg_temp.qa_sign_in(p_user uuid)
RETURNS void
LANGUAGE sql
AS $fn$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$fn$;

-- The app's column order save (supabase-js upsert of tenant, user and order).
CREATE FUNCTION pg_temp.qa_save_order(p_tenant uuid, p_user uuid, p_order text[])
RETURNS void
LANGUAGE sql
AS $fn$
  INSERT INTO public.lead_list_defaults (tenant_id, user_id, column_order)
  VALUES (p_tenant, p_user, p_order)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET column_order = EXCLUDED.column_order;
$fn$;

-- The app's stage scope save, which sends no column order.
CREATE FUNCTION pg_temp.qa_save_scope(p_tenant uuid, p_user uuid, p_scope text)
RETURNS void
LANGUAGE sql
AS $fn$
  INSERT INTO public.lead_list_defaults (tenant_id, user_id, stage_scope)
  VALUES (p_tenant, p_user, p_scope)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET stage_scope = EXCLUDED.stage_scope;
$fn$;

DO $test$
DECLARE
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_user uuid := gen_random_uuid();
  v_colleague uuid := gen_random_uuid();
  v_tenant uuid;
  v_scope text;
  v_order text[];
  v_rows integer;
BEGIN
  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-lld-order-' || u || '@example.invalid'
  FROM unnest(ARRAY[v_user, v_colleague]) AS u;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK tenant', 'qa-lld-order-' || v_tag) RETURNING id INTO v_tenant;
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (v_tenant, v_user, 'member'),
    (v_tenant, v_colleague, 'member');

  -- A user with no saved default saves only a column order.
  PERFORM pg_temp.qa_sign_in(v_user);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_save_order(v_tenant, v_user, ARRAY['phone', 'name']);
  SELECT d.stage_scope, d.column_order INTO v_scope, v_order
  FROM public.lead_list_defaults AS d
  WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
  IF v_scope IS NOT NULL OR v_order IS DISTINCT FROM ARRAY['phone', 'name'] THEN
    RAISE EXCEPTION 'Saving only a column order stored scope % and order %', v_scope, v_order;
  END IF;

  -- Saving a stage scope keeps the column order, and a new order keeps the scope.
  PERFORM pg_temp.qa_save_scope(v_tenant, v_user, 'new');
  PERFORM pg_temp.qa_save_order(v_tenant, v_user, ARRAY['status', 'phone', 'name']);
  SELECT d.stage_scope, d.column_order INTO v_scope, v_order
  FROM public.lead_list_defaults AS d
  WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
  IF v_scope IS DISTINCT FROM 'new'
     OR v_order IS DISTINCT FROM ARRAY['status', 'phone', 'name'] THEN
    RAISE EXCEPTION 'Scope and order overwrote each other: scope %, order %', v_scope, v_order;
  END IF;
  RESET ROLE;

  -- A colleague keeps their own order and cannot read, change or overwrite the user's.
  PERFORM pg_temp.qa_sign_in(v_colleague);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.qa_save_order(v_tenant, v_colleague, ARRAY['actions', 'name']);
  SELECT count(*) INTO v_rows FROM public.lead_list_defaults AS d WHERE d.user_id = v_user;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'A colleague read another user''s column order'; END IF;
  UPDATE public.lead_list_defaults AS d SET column_order = ARRAY['x'] WHERE d.user_id = v_user;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'A colleague changed another user''s column order'; END IF;
  BEGIN
    PERFORM pg_temp.qa_save_order(v_tenant, v_user, ARRAY['x']);
    RAISE EXCEPTION 'A colleague saved a column order for another user';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  SELECT d.column_order INTO v_order
  FROM public.lead_list_defaults AS d
  WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
  IF v_order IS DISTINCT FROM ARRAY['status', 'phone', 'name'] THEN
    RAISE EXCEPTION 'A colleague''s save changed the user''s column order to %', v_order;
  END IF;

  -- The browser-order move's conditional writes (insert-if-missing, then
  -- update-where-empty) never overwrite an order already saved.
  PERFORM pg_temp.qa_sign_in(v_user);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.lead_list_defaults (tenant_id, user_id, column_order)
  VALUES (v_tenant, v_user, ARRAY['legacy'])
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  UPDATE public.lead_list_defaults AS d SET column_order = ARRAY['legacy']
  WHERE d.tenant_id = v_tenant AND d.user_id = v_user AND d.column_order IS NULL;
  RESET ROLE;
  SELECT d.column_order INTO v_order
  FROM public.lead_list_defaults AS d
  WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
  IF v_order IS DISTINCT FROM ARRAY['status', 'phone', 'name'] THEN
    RAISE EXCEPTION 'The browser-order move overwrote a saved order with %', v_order;
  END IF;

  -- On a row with only a stage scope, the same writes fill the empty order.
  UPDATE public.lead_list_defaults AS d SET column_order = NULL
  WHERE d.tenant_id = v_tenant AND d.user_id = v_colleague;
  PERFORM pg_temp.qa_sign_in(v_colleague);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.lead_list_defaults (tenant_id, user_id, column_order)
  VALUES (v_tenant, v_colleague, ARRAY['legacy'])
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  UPDATE public.lead_list_defaults AS d SET column_order = ARRAY['legacy']
  WHERE d.tenant_id = v_tenant AND d.user_id = v_colleague AND d.column_order IS NULL;
  RESET ROLE;
  SELECT d.column_order INTO v_order
  FROM public.lead_list_defaults AS d
  WHERE d.tenant_id = v_tenant AND d.user_id = v_colleague;
  IF v_order IS DISTINCT FROM ARRAY['legacy'] THEN
    RAISE EXCEPTION 'The browser-order move did not fill an empty order (got %)', v_order;
  END IF;

  -- The order is capped at 200 columns.
  BEGIN
    UPDATE public.lead_list_defaults AS d
    SET column_order = array_fill('c'::text, ARRAY[201])
    WHERE d.tenant_id = v_tenant AND d.user_id = v_user;
    RAISE EXCEPTION 'column_order accepted more than 200 ids';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
END
$test$;
SELECT 'Lead list defaults column order: order without scope, scope and order kept apart, colleague isolation, conditional browser-order move and size cap passed' AS result;
ROLLBACK;
