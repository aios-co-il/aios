-- Site analytics access rules (20261102104000_restore_site_analytics_rls.sql
-- and 20261102113700_rls_super_admin_acting_tenant.sql) as each persona meets
-- them through RLS. Synthetic tenants, users and rows; full rollback. Runs on
-- a scratch database, a Preview branch or Staging.
--
-- read:  every site_* table, members of the tenant; a super admin reads all
-- write: site_tracking_configs, members of the active tenant only (a super
--        admin too: they write where they act, never into another tenant);
--        visitors, sessions, page views and events, the service role only
--
-- Inserts carry no RETURNING and are counted as postgres afterwards, so each
-- insert is decided by the INSERT policy alone. Moves and deletes use spare
-- rows seeded per persona. Prints one line per persona, then raises if any
-- line differs from the rule.
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  tenant_a uuid; tenant_b uuid;
  agency_a uuid; agency_b uuid;
  client_a uuid; client_b uuid;
  owner_a uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid();
  member_b uuid := gen_random_uuid();
  super_admin uuid := gen_random_uuid();
  tables text[] := array['site_tracking_configs', 'site_visitors', 'site_sessions', 'site_pageviews', 'site_events'];
  seeds jsonb := '{}';
  personas jsonb;
  p jsonb; tbl text; side text; mark text;
  t_id uuid; t_other uuid; c_id uuid; cfg uuid; spare uuid; visitor uuid; sess uuid; new_id uuid;
  n bigint; reads text; writes text;
  got text; want text;
  lines text[] := '{}';
  failures text[] := '{}';
BEGIN
  -- Fixtures, as postgres.
  INSERT INTO public.tenants (name, slug) VALUES ('QA analytics RLS A', 'qa-sa-rls-a-' || tag) RETURNING id INTO tenant_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA analytics RLS B', 'qa-sa-rls-b-' || tag) RETURNING id INTO tenant_b;
  INSERT INTO public.agencies (tenant_id, name) VALUES (tenant_a, 'QA agency A') RETURNING id INTO agency_a;
  INSERT INTO public.agencies (tenant_id, name) VALUES (tenant_b, 'QA agency B') RETURNING id INTO agency_b;
  INSERT INTO public.clients (tenant_id, agency_id, name) VALUES (tenant_a, agency_a, 'QA client A') RETURNING id INTO client_a;
  INSERT INTO public.clients (tenant_id, agency_id, name) VALUES (tenant_b, agency_b, 'QA client B') RETURNING id INTO client_b;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-sa-rls-' || tag || '-' || i || '@example.invalid'
  FROM unnest(array[owner_a, member_a, member_b, super_admin]) WITH ORDINALITY AS x(u, i);
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (tenant_a, owner_a, 'owner'), (tenant_a, member_a, 'member'), (tenant_b, member_b, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', tenant_a), (member_a, 'campaigner', tenant_a),
    (member_b, 'campaigner', tenant_b), (super_admin, 'super_admin', NULL);
  -- Active tenants are pinned, so get_user_tenant_id resolves the same way every run.
  -- The super admin acts in tenant B and reaches tenant A only as a super admin;
  -- the role comes first, as an active tenant must be one the user may use.
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, tenant_a), (member_a, tenant_a), (member_b, tenant_b), (super_admin, tenant_b);

  personas := jsonb_build_array(
    jsonb_build_object('name', 'owner A', 'role', 'authenticated', 'uid', owner_a, 'reads', 'A', 'writes', 'A'),
    jsonb_build_object('name', 'member A', 'role', 'authenticated', 'uid', member_a, 'reads', 'A', 'writes', 'A'),
    jsonb_build_object('name', 'member B', 'role', 'authenticated', 'uid', member_b, 'reads', 'B', 'writes', 'B'),
    jsonb_build_object('name', 'super admin', 'role', 'authenticated', 'uid', super_admin, 'reads', 'AB', 'writes', 'B'),
    jsonb_build_object('name', 'anon', 'role', 'anon', 'uid', NULL, 'reads', '', 'writes', '')
  );

  -- Per tenant: one tracked visit, as the analytics edge functions write it,
  -- and a spare tracking code per persona for the move and delete checks.
  FOREACH side IN ARRAY array['A', 'B'] LOOP
    t_id := CASE side WHEN 'A' THEN tenant_a ELSE tenant_b END;
    c_id := CASE side WHEN 'A' THEN client_a ELSE client_b END;
    INSERT INTO public.site_tracking_configs (tenant_id, client_id, website_domain)
    VALUES (t_id, c_id, 'qa-' || tag || '.invalid') RETURNING id INTO cfg;
    INSERT INTO public.site_visitors (tenant_id, tracking_config_id, visitor_fingerprint)
    VALUES (t_id, cfg, 'qa-' || tag) RETURNING id INTO visitor;
    INSERT INTO public.site_sessions (tenant_id, tracking_config_id, visitor_id, started_at)
    VALUES (t_id, cfg, visitor, now()) RETURNING id INTO sess;
    INSERT INTO public.site_pageviews (tenant_id, tracking_config_id, visitor_id, session_id, page_url, viewed_at)
    VALUES (t_id, cfg, visitor, sess, 'https://qa.invalid/', now()) RETURNING id INTO new_id;
    seeds := seeds || jsonb_build_object('site_pageviews:' || side, new_id);
    INSERT INTO public.site_events (tenant_id, tracking_config_id, visitor_id, session_id, event_name, occurred_at)
    VALUES (t_id, cfg, visitor, sess, 'qa_click', now()) RETURNING id INTO new_id;
    seeds := seeds || jsonb_build_object('site_events:' || side, new_id,
      'site_tracking_configs:' || side, cfg, 'site_visitors:' || side, visitor, 'site_sessions:' || side, sess);
    FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
      INSERT INTO public.site_tracking_configs (tenant_id, client_id, website_domain)
      VALUES (t_id, c_id, 'qa-spare-' || tag || '.invalid') RETURNING id INTO spare;
      seeds := seeds || jsonb_build_object('spare:' || side || ':' || (p->>'name'), spare);
    END LOOP;
  END LOOP;

  FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
    RESET ROLE;
    PERFORM set_config('request.jwt.claims',
      CASE WHEN p->>'uid' IS NULL THEN ''
        ELSE jsonb_build_object('sub', p->>'uid', 'role', 'authenticated')::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', p->>'role');
    got := ''; want := '';

    FOREACH side IN ARRAY array['A', 'B'] LOOP
      t_id := CASE side WHEN 'A' THEN tenant_a ELSE tenant_b END;
      t_other := CASE side WHEN 'A' THEN tenant_b ELSE tenant_a END;
      c_id := CASE side WHEN 'A' THEN client_a ELSE client_b END;
      cfg := (seeds->>('site_tracking_configs:' || side))::uuid;
      spare := (seeds->>('spare:' || side || ':' || (p->>'name')))::uuid;
      visitor := (seeds->>('site_visitors:' || side))::uuid;
      sess := (seeds->>('site_sessions:' || side))::uuid;
      mark := 'qa-new-' || tag || '-' || replace(p->>'name', ' ', '-') || '-' || side;

      -- Read: the tenant's row in every table.
      reads := '';
      FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('select count(*) from public.%I where id = $1', tbl) INTO n USING (seeds->>(tbl || ':' || side))::uuid;
        reads := reads || n;
      END LOOP;

      writes := '';
      -- i: create a tracking code in this tenant (counted as postgres).
      BEGIN
        INSERT INTO public.site_tracking_configs (tenant_id, client_id, website_domain)
        VALUES (t_id, c_id, mark || '.invalid');
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      SELECT count(*) INTO n FROM public.site_tracking_configs WHERE website_domain = mark || '.invalid';
      EXECUTE format('SET LOCAL ROLE %I', p->>'role');
      IF n > 0 THEN writes := writes || 'i'; END IF;
      -- u: edit the tenant's tracking code.
      UPDATE public.site_tracking_configs SET website_domain = 'qa-edit-' || tag || '.invalid' WHERE id = cfg;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN writes := writes || 'u'; END IF;
      -- m: move a spare code to the other tenant; d: delete it.
      BEGIN
        UPDATE public.site_tracking_configs SET tenant_id = t_other WHERE id = spare;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN writes := writes || 'm'; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      DELETE FROM public.site_tracking_configs WHERE id = spare;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN writes := writes || 'd'; END IF;

      -- Tracked data: V/S/P/E insert (counted as postgres), U edit, D delete; none is allowed.
      BEGIN
        INSERT INTO public.site_visitors (tenant_id, tracking_config_id, visitor_fingerprint) VALUES (t_id, cfg, mark);
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        INSERT INTO public.site_sessions (tenant_id, tracking_config_id, visitor_id, started_at, landing_page)
        VALUES (t_id, cfg, visitor, now(), mark);
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        INSERT INTO public.site_pageviews (tenant_id, tracking_config_id, visitor_id, session_id, page_url, viewed_at)
        VALUES (t_id, cfg, visitor, sess, mark, now());
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        INSERT INTO public.site_events (tenant_id, tracking_config_id, visitor_id, session_id, event_name, occurred_at)
        VALUES (t_id, cfg, visitor, sess, mark, now());
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      IF EXISTS (SELECT 1 FROM public.site_visitors WHERE visitor_fingerprint = mark) THEN writes := writes || 'V'; END IF;
      IF EXISTS (SELECT 1 FROM public.site_sessions WHERE landing_page = mark) THEN writes := writes || 'S'; END IF;
      IF EXISTS (SELECT 1 FROM public.site_pageviews WHERE page_url = mark) THEN writes := writes || 'P'; END IF;
      IF EXISTS (SELECT 1 FROM public.site_events WHERE event_name = mark) THEN writes := writes || 'E'; END IF;
      EXECUTE format('SET LOCAL ROLE %I', p->>'role');
      UPDATE public.site_sessions SET page_count = 9 WHERE id = sess;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN writes := writes || 'U'; END IF;
      DELETE FROM public.site_events WHERE id = (seeds->>('site_events:' || side))::uuid;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN writes := writes || 'D'; END IF;

      got := got || format(' %s:read=%s:write=%s', side, reads, writes);
      -- Nobody moves a code between tenants: writing needs the active tenant on both sides.
      want := want || format(' %s:read=%s:write=%s', side,
        CASE WHEN strpos(p->>'reads', side) > 0 THEN '11111' ELSE '00000' END,
        CASE WHEN strpos(p->>'writes', side) > 0 THEN 'iud' ELSE '' END);
    END LOOP;

    lines := lines || format('%-12s%s', p->>'name', got);
    IF got IS DISTINCT FROM want THEN
      failures := failures || format('%s: got%s, want%s', p->>'name', got, want);
    END IF;
  END LOOP;

  -- The import dialog's session rows fail before RLS: visitor_id is a
  -- site_visitors uuid and the dialog sends text, so sessions keep no user insert.
  BEGIN
    PERFORM json_populate_record(null::public.site_sessions,
      json_build_object('tenant_id', tenant_a, 'visitor_id', 'imported_2026-11-01_0'));
    failures := failures || 'import dialog: a text visitor_id was accepted';
  EXCEPTION WHEN invalid_text_representation THEN
    lines := lines || 'import dialog: visitor_id text refused as 22P02 before RLS'::text;
  END;

  RESET ROLE;
  RAISE NOTICE E'restore_site_analytics_rls (read: configs visitors sessions pageviews events; write: i/u/m/d tracking code, V/S/P/E/U/D tracked data)\n%',
    array_to_string(lines, E'\n');
  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'restore_site_analytics_rls failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Site analytics: tenant reads, active-tenant tracking-code writes, service-only tracked data and anon isolation passed' AS result;
ROLLBACK;
