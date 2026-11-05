-- Finance access rules (20261102100000_restore_finance_rls.sql and
-- 20261102113700_rls_super_admin_acting_tenant.sql) as each persona meets
-- them through RLS. Synthetic tenants, users and rows; full rollback. Runs on
-- a scratch database, a Preview branch or Staging.
--
-- read  = the tenant owner, a super admin, finance_view or finance
-- write = the tenant owner, a super admin or finance
-- Reads cover the acting tenant, and every tenant for a super admin. Writes
-- cover the acting tenant only, a super admin's included. payment_links stays
-- service-role only. suppliers stays tenant-wide (unchanged).
--
-- Inserts carry their own id and no RETURNING, and whether the row exists is
-- read as postgres, so the INSERT policy alone decides the result.
--
-- Prints one line per persona and table, then raises if any line differs
-- from the rule.
BEGIN;
DO $test$
DECLARE
  tenant_a uuid; tenant_b uuid;
  agency_a uuid; agency_b uuid;
  client_a uuid; client_b uuid;
  spare_client_a uuid; spare_client_b uuid;
  supplier_a uuid; supplier_b uuid;
  owner_a uuid := gen_random_uuid();
  finance_a uuid := gen_random_uuid();
  finance_view_a uuid := gen_random_uuid();
  no_finance_a uuid := gen_random_uuid();
  team_manager_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  super_admin uuid := gen_random_uuid();
  tag text := left(gen_random_uuid()::text, 8);

  -- Insert statement per table: $1 tenant, $2 agency, $3 client, $4 supplier, $5 row id.
  inserts jsonb := jsonb_build_object(
    'finance', 'insert into public.finance (id, tenant_id, agency_id, client_id, type, date, amount) values ($5, $1, $2, $3, ''income'', current_date, 100)',
    'expense_payments', 'insert into public.expense_payments (id, tenant_id, expense_type, expense_id, expense_name, amount, payment_month) values ($5, $1, ''supplier'', $4, ''QA'', 100, ''2026-11'')',
    'income_payments', 'insert into public.income_payments (id, tenant_id, client_id, client_name, amount, payment_month) values ($5, $1, $3, ''QA'', 100, ''2026-11'')',
    'one_time_incomes', 'insert into public.one_time_incomes (id, tenant_id, client_id, product_name, amount, payment_month) values ($5, $1, $3, ''QA'', 100, ''2026-11'')',
    'invoice_uploads', 'insert into public.invoice_uploads (id, tenant_id, file_path, agency_id, client_id, supplier_id) values ($5, $1, ''qa/invoice.pdf'', $2, $3, $4)',
    'supplier_invoices', 'insert into public.supplier_invoices (id, tenant_id, supplier_id, invoice_name) values ($5, $1, $4, ''QA'')',
    'payment_links', 'insert into public.payment_links (id, tenant_id, client_id, amount, payment_url) values ($5, $1, $3, 100, ''https://example.invalid/pay'')',
    'client_tenant_financial_data', 'insert into public.client_tenant_financial_data (id, tenant_id, client_id, retainer, monthly_budget) values ($5, $1, $3, 1000, 500)'
  );
  -- expense_payments and income_payments have no update policy; payment_links has none at all.
  no_update text[] := array['expense_payments', 'income_payments', 'payment_links'];
  service_only text[] := array['payment_links'];
  seeds jsonb := '{}';
  personas jsonb;

  p jsonb; tbl text; side text;
  t_id uuid; other_id uuid; agency_id uuid; client_id uuid; supplier_id uuid;
  can_read boolean; can_write boolean; other_write boolean;
  new_id uuid; inserted boolean; n_read bigint; n_upd int; n_move int; n_del int; moved text;
  got text; want text; line_got text; line_want text;
  failures text[] := '{}';
BEGIN
  -- Fixtures, as postgres.
  INSERT INTO public.tenants (name, slug) VALUES ('QA finance RLS A', 'qa-fin-rls-a-' || tag) RETURNING id INTO tenant_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA finance RLS B', 'qa-fin-rls-b-' || tag) RETURNING id INTO tenant_b;
  INSERT INTO public.agencies (tenant_id, name) VALUES (tenant_a, 'QA agency A') RETURNING id INTO agency_a;
  INSERT INTO public.agencies (tenant_id, name) VALUES (tenant_b, 'QA agency B') RETURNING id INTO agency_b;
  INSERT INTO public.clients (tenant_id, agency_id, name) VALUES (tenant_a, agency_a, 'QA client A') RETURNING id INTO client_a;
  INSERT INTO public.clients (tenant_id, agency_id, name) VALUES (tenant_b, agency_b, 'QA client B') RETURNING id INTO client_b;
  -- client_tenant_financial_data is unique per client and tenant, so persona inserts use a second client.
  INSERT INTO public.clients (tenant_id, agency_id, name) VALUES (tenant_a, agency_a, 'QA spare client A') RETURNING id INTO spare_client_a;
  INSERT INTO public.clients (tenant_id, agency_id, name) VALUES (tenant_b, agency_b, 'QA spare client B') RETURNING id INTO spare_client_b;
  INSERT INTO public.suppliers (tenant_id, name, type) VALUES (tenant_a, 'QA supplier A', 'other') RETURNING id INTO supplier_a;
  INSERT INTO public.suppliers (tenant_id, name, type) VALUES (tenant_b, 'QA supplier B', 'other') RETURNING id INTO supplier_b;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-fin-rls-' || tag || '-' || n || '@example.invalid'
  FROM unnest(array[owner_a, finance_a, finance_view_a, no_finance_a, team_manager_a, owner_b, super_admin])
    WITH ORDINALITY AS x(u, n);

  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (tenant_a, owner_a, 'owner'),
    (tenant_a, finance_a, 'member'),
    (tenant_a, finance_view_a, 'member'),
    (tenant_a, no_finance_a, 'member'),
    (tenant_a, team_manager_a, 'member'),
    (tenant_b, owner_b, 'owner');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', tenant_a),
    (finance_a, 'campaigner', tenant_a),
    (finance_view_a, 'campaigner', tenant_a),
    (no_finance_a, 'campaigner', tenant_a),
    (team_manager_a, 'team_manager', tenant_a),
    (owner_b, 'owner', tenant_b),
    (super_admin, 'super_admin', NULL);
  -- Each persona's active tenant is pinned, so get_user_tenant_id resolves the same way every run.
  -- The super admin belongs to no tenant and acts in A, as after switching to it; the role
  -- comes first, as an active tenant must be one the user may use.
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, tenant_a), (finance_a, tenant_a), (finance_view_a, tenant_a),
    (no_finance_a, tenant_a), (team_manager_a, tenant_a), (owner_b, tenant_b),
    (super_admin, tenant_a);
  -- The member without finance has other modules, and finance rows switched off.
  INSERT INTO public.user_permissions (user_id, module, can_access) VALUES
    (finance_a, 'finance', true),
    (finance_view_a, 'finance_view', true),
    (no_finance_a, 'suppliers', true),
    (no_finance_a, 'finance', false),
    (no_finance_a, 'finance_view', false);

  -- One row per table and tenant, as the service role would write it.
  FOR tbl IN SELECT jsonb_object_keys(inserts) LOOP
    new_id := gen_random_uuid();
    EXECUTE inserts->>tbl USING tenant_a, agency_a, client_a, supplier_a, new_id;
    seeds := jsonb_set(seeds, array[tbl || ':A'], to_jsonb(new_id));
    new_id := gen_random_uuid();
    EXECUTE inserts->>tbl USING tenant_b, agency_b, client_b, supplier_b, new_id;
    seeds := jsonb_set(seeds, array[tbl || ':B'], to_jsonb(new_id));
  END LOOP;

  personas := jsonb_build_array(
    jsonb_build_object('name', 'owner A', 'role', 'authenticated', 'uid', owner_a, 'reads', 'A', 'writes', 'A', 'member', 'A'),
    jsonb_build_object('name', 'finance A', 'role', 'authenticated', 'uid', finance_a, 'reads', 'A', 'writes', 'A', 'member', 'A'),
    jsonb_build_object('name', 'finance_view A', 'role', 'authenticated', 'uid', finance_view_a, 'reads', 'A', 'writes', '', 'member', 'A'),
    jsonb_build_object('name', 'no finance A', 'role', 'authenticated', 'uid', no_finance_a, 'reads', '', 'writes', '', 'member', 'A'),
    jsonb_build_object('name', 'team manager A', 'role', 'authenticated', 'uid', team_manager_a, 'reads', '', 'writes', '', 'member', 'A'),
    jsonb_build_object('name', 'owner B', 'role', 'authenticated', 'uid', owner_b, 'reads', 'B', 'writes', 'B', 'member', 'B'),
    jsonb_build_object('name', 'super admin', 'role', 'authenticated', 'uid', super_admin, 'reads', 'AB', 'writes', 'A', 'member', 'AB'),
    jsonb_build_object('name', 'anon', 'role', 'anon', 'uid', NULL, 'reads', '', 'writes', '', 'member', '')
  );

  FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
    RESET ROLE;
    PERFORM set_config('request.jwt.claims',
      CASE WHEN p->>'uid' IS NULL THEN ''
        ELSE jsonb_build_object('sub', p->>'uid', 'role', 'authenticated')::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', p->>'role');

    FOR tbl IN SELECT jsonb_object_keys(inserts) ORDER BY 1 LOOP
      line_got := ''; line_want := '';
      FOREACH side IN ARRAY array['A', 'B'] LOOP
        IF side = 'A' THEN
          t_id := tenant_a; other_id := tenant_b; agency_id := agency_a; client_id := spare_client_a; supplier_id := supplier_a;
        ELSE
          t_id := tenant_b; other_id := tenant_a; agency_id := agency_b; client_id := spare_client_b; supplier_id := supplier_b;
        END IF;
        can_read := strpos(p->>'reads', side) > 0 AND NOT tbl = ANY (service_only);
        can_write := strpos(p->>'writes', side) > 0 AND NOT tbl = ANY (service_only);
        other_write := strpos(p->>'writes', CASE side WHEN 'A' THEN 'B' ELSE 'A' END) > 0;

        EXECUTE format('select count(*) from public.%I where tenant_id = $1', tbl) INTO n_read USING t_id;
        new_id := gen_random_uuid();
        BEGIN
          EXECUTE inserts->>tbl USING t_id, agency_id, client_id, supplier_id, new_id;
        EXCEPTION WHEN insufficient_privilege THEN
          NULL;
        END;
        -- Read as postgres, so neither the SELECT policy nor RETURNING colours the result.
        RESET ROLE;
        EXECUTE format('select exists (select 1 from public.%I where id = $1)', tbl) INTO inserted USING new_id;
        EXECUTE format('SET LOCAL ROLE %I', p->>'role');

        IF inserted THEN
          -- Own row: edit it, try to move it to the other tenant, remove it.
          EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', tbl) USING new_id;
          GET DIAGNOSTICS n_upd = ROW_COUNT;
          BEGIN
            EXECUTE format('update public.%I set tenant_id = $2 where id = $1', tbl) USING new_id, other_id;
            GET DIAGNOSTICS n_move = ROW_COUNT;
            moved := CASE WHEN n_move = 1 THEN 'moved' ELSE 'move 0' END;
          EXCEPTION WHEN insufficient_privilege THEN
            moved := 'move denied';
          END;
          EXECUTE format('delete from public.%I where id = $1', tbl) USING new_id;
          GET DIAGNOSTICS n_del = ROW_COUNT;
          got := format('read %s, insert ok, update %s, %s, delete %s', n_read, n_upd, moved, n_del);
        ELSE
          -- No insert: the tenant's seeded row must not be editable or removable either.
          EXECUTE format('update public.%I set tenant_id = tenant_id where id = $1', tbl) USING (seeds->>(tbl || ':' || side))::uuid;
          GET DIAGNOSTICS n_upd = ROW_COUNT;
          EXECUTE format('delete from public.%I where id = $1', tbl) USING (seeds->>(tbl || ':' || side))::uuid;
          GET DIAGNOSTICS n_del = ROW_COUNT;
          got := format('read %s, insert denied, update %s, delete %s', n_read, n_upd, n_del);
        END IF;
        -- Remove the persona's row as postgres, so a row a broken policy left behind cannot affect the next persona.
        RESET ROLE;
        EXECUTE format('delete from public.%I where id = $1', tbl) USING new_id;
        EXECUTE format('SET LOCAL ROLE %I', p->>'role');

        IF can_write THEN
          want := format('read %s, insert ok, update %s, %s, delete 1',
            CASE WHEN can_read THEN 1 ELSE 0 END,
            CASE WHEN tbl = ANY (no_update) THEN 0 ELSE 1 END,
            CASE WHEN tbl = ANY (no_update) THEN 'move 0' WHEN other_write THEN 'moved' ELSE 'move denied' END);
        ELSE
          want := format('read %s, insert denied, update 0, delete 0', CASE WHEN can_read THEN 1 ELSE 0 END);
        END IF;

        line_got := line_got || ' | ' || side || ': ' || got;
        line_want := line_want || ' | ' || side || ': ' || want;
      END LOOP;

      RAISE NOTICE '%', rpad(p->>'name', 14) || ' / ' || rpad(tbl, 28) || line_got;
      IF line_got <> line_want THEN
        failures := failures || format('%s / %s: got%s; want%s', p->>'name', tbl, line_got, line_want);
      END IF;
    END LOOP;

    -- suppliers keeps its tenant-wide rule: every member reads their tenant's suppliers.
    SELECT format('A %s, B %s',
      count(*) FILTER (WHERE s.tenant_id = tenant_a), count(*) FILTER (WHERE s.tenant_id = tenant_b))
    INTO got FROM public.suppliers s WHERE s.tenant_id IN (tenant_a, tenant_b);
    want := format('A %s, B %s',
      CASE WHEN strpos(p->>'member', 'A') > 0 THEN 1 ELSE 0 END,
      CASE WHEN strpos(p->>'member', 'B') > 0 THEN 1 ELSE 0 END);
    RAISE NOTICE '%', rpad(p->>'name', 14) || ' / ' || rpad('suppliers (unchanged)', 28) || ' | ' || got;
    IF got <> want THEN
      failures := failures || format('%s / suppliers: got %s; want %s', p->>'name', got, want);
    END IF;
  END LOOP;
  RESET ROLE;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'Finance RLS differs from the rule:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Finance read and write rules hold for owner, finance, finance_view, no finance, team manager, other tenant, super admin (acting tenant only) and anon' AS result;
ROLLBACK;
