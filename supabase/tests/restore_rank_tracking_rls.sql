-- Rank tracking access rules (20261102105000_restore_rank_tracking_rls.sql
-- and 20261102113700_rls_super_admin_acting_tenant.sql) as each persona meets
-- them through RLS. Synthetic tenants, users and rows; full rollback. Runs on
-- a scratch database, a Preview branch or Staging.
--
-- projects and keywords: members of the active tenant read, create, edit and
--   delete; a super admin reads every tenant and writes only where they act,
--   never into another tenant. Keywords follow their project.
-- history: read as its keyword's project; written only by the service role.
-- competitors, alerts and alert logs: service role only.
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
  owner_a uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid();
  member_b uuid := gen_random_uuid();
  super_admin uuid := gen_random_uuid();
  seeds jsonb := '{}';
  personas jsonb;
  p jsonb; side text; other text; mark text;
  t_id uuid; t_other uuid; proj_id uuid; kw_id uuid; hist_id uuid; spare_proj uuid; spare_kw uuid; new_id uuid;
  n bigint; reads text; acts text; got text; want text;
  lines text[] := '{}';
  failures text[] := '{}';
BEGIN
  -- Fixtures, as postgres.
  INSERT INTO public.tenants (name, slug) VALUES ('QA rank RLS A', 'qa-rank-rls-a-' || tag) RETURNING id INTO tenant_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA rank RLS B', 'qa-rank-rls-b-' || tag) RETURNING id INTO tenant_b;

  INSERT INTO auth.users (id, email)
  SELECT u, 'qa-rank-rls-' || tag || '-' || i || '@example.invalid'
  FROM unnest(array[owner_a, member_a, member_b, super_admin]) WITH ORDINALITY AS x(u, i);
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (tenant_a, owner_a, 'owner'), (tenant_a, member_a, 'member'), (tenant_b, member_b, 'member');
  INSERT INTO public.user_roles (user_id, role, tenant_id) VALUES
    (owner_a, 'owner', tenant_a), (member_a, 'seo', tenant_a),
    (member_b, 'seo', tenant_b), (super_admin, 'super_admin', NULL);
  -- Active tenants are pinned, so get_user_tenant_id resolves the same way every run.
  -- The super admin works in tenant B and reaches tenant A only as a super admin;
  -- the role comes first, as an active tenant must be one the user may use.
  INSERT INTO public.user_active_tenant (user_id, tenant_id) VALUES
    (owner_a, tenant_a), (member_a, tenant_a), (member_b, tenant_b), (super_admin, tenant_b);

  personas := jsonb_build_array(
    jsonb_build_object('name', 'owner A', 'role', 'authenticated', 'uid', owner_a, 'reads', 'A', 'manages', 'A', 'creates', 'A'),
    jsonb_build_object('name', 'member A', 'role', 'authenticated', 'uid', member_a, 'reads', 'A', 'manages', 'A', 'creates', 'A'),
    jsonb_build_object('name', 'member B', 'role', 'authenticated', 'uid', member_b, 'reads', 'B', 'manages', 'B', 'creates', 'B'),
    jsonb_build_object('name', 'super admin', 'role', 'authenticated', 'uid', super_admin, 'reads', 'AB', 'manages', 'B', 'creates', 'B'),
    jsonb_build_object('name', 'anon', 'role', 'anon', 'uid', NULL, 'reads', '', 'manages', '', 'creates', '')
  );

  -- Per tenant: a tracked project, keyword and position (serpapi-search writes
  -- history), one row in each unused table, and a spare project and keyword
  -- per persona for the move and delete checks.
  FOREACH side IN ARRAY array['A', 'B'] LOOP
    t_id := CASE side WHEN 'A' THEN tenant_a ELSE tenant_b END;
    INSERT INTO public.rank_tracking_projects (tenant_id, name, domain)
    VALUES (t_id, 'QA ' || side, 'qa-' || tag || '.invalid') RETURNING id INTO proj_id;
    INSERT INTO public.rank_tracking_keywords (project_id, keyword) VALUES (proj_id, 'qa keyword') RETURNING id INTO kw_id;
    INSERT INTO public.rank_tracking_history (keyword_id, position) VALUES (kw_id, 3) RETURNING id INTO hist_id;
    INSERT INTO public.rank_tracking_competitors (project_id, domain) VALUES (proj_id, 'rival-' || tag || '.invalid');
    INSERT INTO public.rank_tracking_alerts (project_id, alert_type, threshold) VALUES (proj_id, 'position_drop', 5) RETURNING id INTO new_id;
    INSERT INTO public.rank_tracking_alert_logs (alert_id, keyword_id, message) VALUES (new_id, kw_id, 'QA');
    seeds := seeds || jsonb_build_object('project:' || side, proj_id, 'keyword:' || side, kw_id, 'history:' || side, hist_id);
    FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
      INSERT INTO public.rank_tracking_projects (tenant_id, name, domain)
      VALUES (t_id, 'QA spare ' || (p->>'name'), 'qa-spare-' || tag || '.invalid') RETURNING id INTO spare_proj;
      INSERT INTO public.rank_tracking_keywords (project_id, keyword) VALUES (spare_proj, 'qa spare') RETURNING id INTO spare_kw;
      seeds := seeds || jsonb_build_object(
        'spare_project:' || side || ':' || (p->>'name'), spare_proj,
        'spare_keyword:' || side || ':' || (p->>'name'), spare_kw);
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
      other := CASE side WHEN 'A' THEN 'B' ELSE 'A' END;
      t_id := CASE side WHEN 'A' THEN tenant_a ELSE tenant_b END;
      t_other := CASE side WHEN 'A' THEN tenant_b ELSE tenant_a END;
      proj_id := (seeds->>('project:' || side))::uuid;
      kw_id := (seeds->>('keyword:' || side))::uuid;
      hist_id := (seeds->>('history:' || side))::uuid;
      spare_proj := (seeds->>('spare_project:' || side || ':' || (p->>'name')))::uuid;
      spare_kw := (seeds->>('spare_keyword:' || side || ':' || (p->>'name')))::uuid;
      mark := 'qa-new-' || tag || '-' || replace(p->>'name', ' ', '-') || '-' || side;

      -- Read: project, keyword, history, then competitors, alerts and alert logs.
      SELECT (SELECT count(*) FROM public.rank_tracking_projects WHERE id = proj_id)::text
        || (SELECT count(*) FROM public.rank_tracking_keywords WHERE id = kw_id)::text
        || (SELECT count(*) FROM public.rank_tracking_history WHERE id = hist_id)::text
        || (SELECT count(*) FROM public.rank_tracking_competitors WHERE project_id = proj_id)::text
        || (SELECT count(*) FROM public.rank_tracking_alerts WHERE project_id = proj_id)::text
        || (SELECT count(*) FROM public.rank_tracking_alert_logs WHERE keyword_id = kw_id)::text
        INTO reads;

      acts := '';
      -- i: create a project; k: add a keyword to the tenant's project (both counted as postgres).
      BEGIN
        INSERT INTO public.rank_tracking_projects (tenant_id, name, domain) VALUES (t_id, mark, 'qa-new.invalid');
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        INSERT INTO public.rank_tracking_keywords (project_id, keyword) VALUES (proj_id, mark);
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      IF EXISTS (SELECT 1 FROM public.rank_tracking_projects WHERE name = mark) THEN acts := acts || 'i'; END IF;
      IF EXISTS (SELECT 1 FROM public.rank_tracking_keywords WHERE keyword = mark) THEN acts := acts || 'k'; END IF;
      EXECUTE format('SET LOCAL ROLE %I', p->>'role');
      -- u: edit the project; e: edit the keyword.
      UPDATE public.rank_tracking_projects SET name = 'QA edited' WHERE id = proj_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'u'; END IF;
      UPDATE public.rank_tracking_keywords SET target_url = 'https://qa.invalid/' WHERE id = kw_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'e'; END IF;
      -- m: move a project to the other tenant; n: move a keyword to the other tenant's project.
      BEGIN
        UPDATE public.rank_tracking_projects SET tenant_id = t_other WHERE id = spare_proj;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN acts := acts || 'm'; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        UPDATE public.rank_tracking_keywords SET project_id = (seeds->>('project:' || other))::uuid WHERE id = spare_kw;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN acts := acts || 'n'; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      -- h: write a position; c: add a competitor (service role only; counted as postgres).
      BEGIN
        INSERT INTO public.rank_tracking_history (keyword_id, position, url_found) VALUES (kw_id, 1, mark);
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        INSERT INTO public.rank_tracking_competitors (project_id, domain) VALUES (proj_id, mark);
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      IF EXISTS (SELECT 1 FROM public.rank_tracking_history WHERE url_found = mark) THEN acts := acts || 'h'; END IF;
      IF EXISTS (SELECT 1 FROM public.rank_tracking_competitors WHERE domain = mark) THEN acts := acts || 'c'; END IF;
      EXECUTE format('SET LOCAL ROLE %I', p->>'role');
      -- x: delete a keyword; d: delete a project.
      DELETE FROM public.rank_tracking_keywords WHERE id = spare_kw;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'x'; END IF;
      DELETE FROM public.rank_tracking_projects WHERE id = spare_proj;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'd'; END IF;

      got := got || format(' %s:read=%s:%s', side, reads, nullif(acts, ''));
      want := want || format(' %s:read=%s:%s', side,
        CASE WHEN strpos(p->>'reads', side) > 0 THEN '111000' ELSE '000000' END,
        CASE WHEN strpos(p->>'creates', side) > 0 THEN 'ik' ELSE '' END
          -- Nobody moves a row between tenants: writing needs the active tenant on both sides.
          || CASE WHEN strpos(p->>'manages', side) > 0 THEN 'uexd' ELSE '' END);
    END LOOP;

    lines := lines || format('%-12s%s', p->>'name', got);
    IF got IS DISTINCT FROM want THEN
      failures := failures || format('%s: got%s, want%s', p->>'name', got, want);
    END IF;
  END LOOP;

  RESET ROLE;
  RAISE NOTICE E'restore_rank_tracking_rls (read: project keyword history competitors alerts alert_logs; i/k create project/keyword, u/e edit, m/n move to other tenant, h/c history/competitor write, x/d delete keyword/project)\n%',
    array_to_string(lines, E'\n');
  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'restore_rank_tracking_rls failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Rank tracking: active-tenant projects and keywords, read-only history, service-only alerts and anon isolation passed' AS result;
ROLLBACK;
