-- Gmail access rules (20261102106000_restore_gmail_rls.sql and
-- 20261102113700_rls_super_admin_acting_tenant.sql) as each persona meets
-- them through RLS. Synthetic tenants, users and rows; full rollback. Runs on
-- a scratch database, a Preview branch or Staging.
--
-- labels, blocked senders, subject rules, message categories: own rows only
--   (another user of the same tenant sees nothing)
-- categories: members of the tenant read and write; a super admin reads every
--   tenant and writes only where they act, never into another tenant
-- gmail_tokens: no user reads or writes them, not even the owner;
--   get_user_gmail_connection returns the caller's address and nothing else
--
-- Inserts carry no RETURNING and are counted as postgres afterwards, so each
-- insert is decided by the INSERT check alone. Moves and deletes use spare
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
  users uuid[];
  personal text[] := array['gmail_allowed_labels', 'gmail_blocked_senders', 'gmail_category_rules', 'gmail_message_categories'];
  -- Insert statement per personal table: $1 tenant, $2 user, $3 category, $4 a unique text.
  inserts jsonb := jsonb_build_object(
    'gmail_allowed_labels', 'insert into public.gmail_allowed_labels (tenant_id, user_id, label_id, label_name) values ($1, $2, $4, ''QA'')',
    'gmail_blocked_senders', 'insert into public.gmail_blocked_senders (tenant_id, user_id, email_address) values ($1, $2, $4)',
    'gmail_category_rules', 'insert into public.gmail_category_rules (tenant_id, user_id, category_id, subject_pattern) values ($1, $2, $3, $4)',
    'gmail_message_categories', 'insert into public.gmail_message_categories (tenant_id, user_id, message_id, category_id) values ($1, $2, $4, $3)'
  );
  -- The column each personal table stores the unique text in.
  marks jsonb := jsonb_build_object(
    'gmail_allowed_labels', 'label_id', 'gmail_blocked_senders', 'email_address',
    'gmail_category_rules', 'subject_pattern', 'gmail_message_categories', 'message_id'
  );
  seeds jsonb := '{}';
  personas jsonb;
  p jsonb; tbl text; side text; u uuid; mark text;
  me uuid; my_tenant uuid; my_category uuid; t_id uuid; t_other uuid; cat uuid; spare uuid; new_id uuid; foreign_id uuid;
  n bigint; seen text; acts text; fn text; got text; want text;
  lines text[] := '{}';
  failures text[] := '{}';
BEGIN
  -- Fixtures, as postgres.
  INSERT INTO public.tenants (name, slug) VALUES ('QA gmail RLS A', 'qa-gmail-rls-a-' || tag) RETURNING id INTO tenant_a;
  INSERT INTO public.tenants (name, slug) VALUES ('QA gmail RLS B', 'qa-gmail-rls-b-' || tag) RETURNING id INTO tenant_b;
  users := array[owner_a, member_a, member_b, super_admin];
  INSERT INTO auth.users (id, email)
  SELECT x.u, 'qa-gmail-rls-' || tag || '-' || x.i || '@example.invalid'
  FROM unnest(users) WITH ORDINALITY AS x(u, i);
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
    jsonb_build_object('name', 'owner A', 'role', 'authenticated', 'uid', owner_a, 'tenant', tenant_a,
      'reads', 'A', 'writes', 'A', 'own', '100', 'connected', true),
    jsonb_build_object('name', 'member A', 'role', 'authenticated', 'uid', member_a, 'tenant', tenant_a,
      'reads', 'A', 'writes', 'A', 'own', '010', 'connected', true),
    jsonb_build_object('name', 'member B', 'role', 'authenticated', 'uid', member_b, 'tenant', tenant_b,
      'reads', 'B', 'writes', 'B', 'own', '001', 'connected', true),
    jsonb_build_object('name', 'super admin', 'role', 'authenticated', 'uid', super_admin, 'tenant', tenant_b,
      'reads', 'AB', 'writes', 'B', 'own', '000', 'connected', false),
    jsonb_build_object('name', 'anon', 'role', 'anon', 'uid', NULL, 'tenant', NULL,
      'reads', '', 'writes', '', 'own', '000', 'connected', false)
  );

  -- One shared category per tenant, plus a spare per persona for the move and delete checks.
  FOREACH side IN ARRAY array['A', 'B'] LOOP
    t_id := CASE side WHEN 'A' THEN tenant_a ELSE tenant_b END;
    INSERT INTO public.gmail_categories (tenant_id, name) VALUES (t_id, 'QA ' || side) RETURNING id INTO cat;
    seeds := seeds || jsonb_build_object('category:' || side, cat);
    FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
      INSERT INTO public.gmail_categories (tenant_id, name) VALUES (t_id, 'QA spare') RETURNING id INTO spare;
      seeds := seeds || jsonb_build_object('spare:' || side || ':' || (p->>'name'), spare);
    END LOOP;
  END LOOP;
  -- Tokens and personal settings for the three tenant members, as gmail-auth and the app write them.
  FOREACH u IN ARRAY array[owner_a, member_a, member_b] LOOP
    t_id := CASE WHEN u = member_b THEN tenant_b ELSE tenant_a END;
    cat := (seeds->>('category:' || CASE WHEN u = member_b THEN 'B' ELSE 'A' END))::uuid;
    INSERT INTO public.gmail_tokens (tenant_id, user_id, access_token, refresh_token, expires_at, google_email)
    VALUES (t_id, u, 'secret-access-' || tag, 'secret-refresh-' || tag, now() + interval '1 hour', 'qa-' || u || '@example.invalid');
    FOREACH tbl IN ARRAY personal LOOP
      EXECUTE inserts->>tbl USING t_id, u, cat, 'qa-seed-' || tag;
      EXECUTE format('select id from public.%I where user_id = $1 and %I = $2', tbl, marks->>tbl)
        INTO new_id USING u, 'qa-seed-' || tag;
      seeds := seeds || jsonb_build_object(tbl || ':' || u, new_id);
    END LOOP;
  END LOOP;

  -- The connection function returns the address column alone.
  SELECT pg_get_function_result('public.get_user_gmail_connection()'::regprocedure) INTO fn;
  IF fn IS DISTINCT FROM 'TABLE(google_email text)' THEN
    failures := failures || format('get_user_gmail_connection returns %s', fn);
  END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
    me := (p->>'uid')::uuid;
    my_tenant := (p->>'tenant')::uuid;
    my_category := (seeds->>('category:' || CASE WHEN my_tenant = tenant_a THEN 'A' ELSE 'B' END))::uuid;
    -- The user whose settings each persona tries to write: someone else in the same tenant, else owner A.
    foreign_id := CASE WHEN me = owner_a THEN member_a ELSE owner_a END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims',
      CASE WHEN me IS NULL THEN ''
        ELSE jsonb_build_object('sub', me, 'role', 'authenticated')::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', p->>'role');
    got := ''; want := '';

    -- Personal settings: whose seeded rows are visible (owner A, member A, member B), then
    -- o/f insert own/someone else's, u/v edit own/someone else's, m hand own to someone else, x/d delete someone else's/own.
    FOREACH tbl IN ARRAY personal LOOP
      seen := '';
      FOREACH u IN ARRAY array[owner_a, member_a, member_b] LOOP
        EXECUTE format('select count(*) from public.%I where id = $1', tbl) INTO n USING (seeds->>(tbl || ':' || u))::uuid;
        seen := seen || n;
      END LOOP;
      acts := '';
      mark := 'qa-' || tag || '-' || replace(p->>'name', ' ', '-');
      IF me IS NOT NULL THEN
        BEGIN
          EXECUTE inserts->>tbl USING coalesce(my_tenant, tenant_a), me, coalesce(my_category, (seeds->>'category:A')::uuid), mark || '-own';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END IF;
      BEGIN
        EXECUTE inserts->>tbl USING tenant_a, foreign_id, (seeds->>'category:A')::uuid, mark || '-foreign';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      new_id := NULL;
      EXECUTE format('select id from public.%I where %I = $1', tbl, marks->>tbl) INTO new_id USING mark || '-own';
      IF new_id IS NOT NULL THEN acts := acts || 'o'; END IF;
      EXECUTE format('select count(*) from public.%I where %I = $1', tbl, marks->>tbl) INTO n USING mark || '-foreign';
      IF n > 0 THEN acts := acts || 'f'; END IF;
      EXECUTE format('SET LOCAL ROLE %I', p->>'role');
      IF new_id IS NOT NULL THEN
        EXECUTE format('update public.%I set created_at = now() where id = $1', tbl) USING new_id;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN acts := acts || 'u'; END IF;
      END IF;
      EXECUTE format('update public.%I set created_at = now() where id = $1', tbl) USING (seeds->>(tbl || ':' || foreign_id))::uuid;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'v'; END IF;
      IF new_id IS NOT NULL THEN
        BEGIN
          EXECUTE format('update public.%I set user_id = $2 where id = $1', tbl) USING new_id, foreign_id;
          GET DIAGNOSTICS n = ROW_COUNT;
          IF n > 0 THEN acts := acts || 'm'; END IF;
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END IF;
      EXECUTE format('delete from public.%I where id = $1', tbl) USING (seeds->>(tbl || ':' || foreign_id))::uuid;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'x'; END IF;
      IF new_id IS NOT NULL THEN
        EXECUTE format('delete from public.%I where id = $1', tbl) USING new_id;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN acts := acts || 'd'; END IF;
      END IF;
      got := got || format(' %s=%s:%s', replace(tbl, 'gmail_', ''), seen, acts);
      want := want || format(' %s=%s:%s', replace(tbl, 'gmail_', ''), p->>'own',
        CASE WHEN me IS NULL THEN '' ELSE 'oud' END);
    END LOOP;

    -- Shared categories, per tenant: read, i create (counted as postgres), u edit, m move to the other tenant, d delete.
    FOREACH side IN ARRAY array['A', 'B'] LOOP
      t_id := CASE side WHEN 'A' THEN tenant_a ELSE tenant_b END;
      t_other := CASE side WHEN 'A' THEN tenant_b ELSE tenant_a END;
      cat := (seeds->>('category:' || side))::uuid;
      spare := (seeds->>('spare:' || side || ':' || (p->>'name')))::uuid;
      mark := 'qa-' || tag || '-' || replace(p->>'name', ' ', '-') || '-' || side;
      SELECT count(*) INTO n FROM public.gmail_categories WHERE id = cat;
      acts := n::text || ':';
      BEGIN
        INSERT INTO public.gmail_categories (tenant_id, name) VALUES (t_id, mark);
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      SELECT count(*) INTO n FROM public.gmail_categories WHERE name = mark;
      EXECUTE format('SET LOCAL ROLE %I', p->>'role');
      IF n > 0 THEN acts := acts || 'i'; END IF;
      UPDATE public.gmail_categories SET color = '#000000' WHERE id = cat;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'u'; END IF;
      BEGIN
        UPDATE public.gmail_categories SET tenant_id = t_other WHERE id = spare;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN acts := acts || 'm'; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      DELETE FROM public.gmail_categories WHERE id = spare;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN acts := acts || 'd'; END IF;
      got := got || format(' categories %s=%s', side, acts);
      -- Nobody moves a category between tenants: writing needs the active tenant on both sides.
      want := want || format(' categories %s=%s:%s', side,
        CASE WHEN strpos(p->>'reads', side) > 0 THEN '1' ELSE '0' END,
        CASE WHEN strpos(p->>'writes', side) > 0 THEN 'iud' ELSE '' END);
    END LOOP;

    -- Tokens: no row is readable, own included; T insert (counted as postgres), U edit, D delete.
    SELECT count(*) INTO n FROM public.gmail_tokens;
    acts := n::text || ':';
    BEGIN
      INSERT INTO public.gmail_tokens (tenant_id, user_id, access_token, refresh_token, expires_at)
      VALUES (tenant_a, coalesce(me, super_admin), 'qa-' || tag || '-' || replace(p->>'name', ' ', '-'), 'x', now());
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    SELECT count(*) INTO n FROM public.gmail_tokens WHERE access_token = 'qa-' || tag || '-' || replace(p->>'name', ' ', '-');
    EXECUTE format('SET LOCAL ROLE %I', p->>'role');
    IF n > 0 THEN acts := acts || 'T'; END IF;
    UPDATE public.gmail_tokens SET access_token = 'stolen' WHERE user_id = me;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN acts := acts || 'U'; END IF;
    DELETE FROM public.gmail_tokens WHERE user_id = me;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN acts := acts || 'D'; END IF;
    got := got || ' tokens=' || acts;
    want := want || ' tokens=0:';

    -- The connection check: the caller's own address, nothing for no connection, refused for anon.
    BEGIN
      SELECT coalesce(string_agg(c.google_email, ','), '-') INTO fn FROM public.get_user_gmail_connection() c;
    EXCEPTION WHEN insufficient_privilege THEN fn := 'refused';
    END;
    got := got || ' connection=' || CASE WHEN fn = 'qa-' || me || '@example.invalid' THEN 'own' ELSE fn END;
    want := want || ' connection=' || CASE
      WHEN me IS NULL THEN 'refused'
      WHEN (p->>'connected')::boolean THEN 'own'
      ELSE '-' END;

    lines := lines || format('%-12s%s', p->>'name', got);
    IF got IS DISTINCT FROM want THEN
      failures := failures || format('%s: got%s, want%s', p->>'name', got, want);
    END IF;
  END LOOP;

  RESET ROLE;
  RAISE NOTICE E'restore_gmail_rls (personal: rows seen of owner A/member A/member B, then o/f insert own/other''s, u/v edit own/other''s, m give away, x/d delete other''s/own; categories: seen, i/u/m/d; tokens: seen, T/U/D)\n%',
    array_to_string(lines, E'\n');
  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'restore_gmail_rls failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Gmail: own settings, active-tenant categories, unreadable tokens, connection check and anon isolation passed' AS result;
ROLLBACK;
