-- Microsoft tokens access (20261103110000_microsoft_tokens.sql) as each
-- persona meets it. Synthetic tenant, users and token row; full rollback.
-- Runs on a scratch database, a Preview branch or Staging.
--
-- microsoft_tokens: no browser role reads, writes or deletes it, not even the
--   owner
-- get_user_microsoft_connection: the owner gets their address and account
--   type; another user gets no row; anon may not call it
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  tenant_a uuid;
  owner_a uuid := gen_random_uuid();
  other_a uuid := gen_random_uuid();
  personas jsonb;
  p jsonb;
  me uuid;
  got text; want text;
  failures text[] := '{}';
BEGIN
  -- Fixtures, as postgres.
  INSERT INTO public.tenants (name, slug) VALUES ('QA microsoft tokens', 'qa-ms-tokens-' || tag) RETURNING id INTO tenant_a;
  INSERT INTO auth.users (id, email) VALUES
    (owner_a, 'qa-ms-tokens-' || tag || '-1@example.invalid'),
    (other_a, 'qa-ms-tokens-' || tag || '-2@example.invalid');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (tenant_a, owner_a, 'owner'), (tenant_a, other_a, 'member');
  INSERT INTO public.microsoft_tokens (user_id, tenant_id, access_token, refresh_token, expires_at, microsoft_email, account_type)
  VALUES (owner_a, tenant_a, 'at', 'rt', now() + interval '1 hour', 'owner@contoso.example', 'work');

  -- want: s/u/d = select/update/delete on the table refused; then the RPC result.
  personas := jsonb_build_array(
    jsonb_build_object('name', 'owner', 'role', 'authenticated', 'uid', owner_a, 'want', 'sud owner@contoso.example/work'),
    jsonb_build_object('name', 'other user', 'role', 'authenticated', 'uid', other_a, 'want', 'sud none'),
    jsonb_build_object('name', 'anon', 'role', 'anon', 'uid', NULL, 'want', 'sud refused')
  );

  FOR p IN SELECT * FROM jsonb_array_elements(personas) LOOP
    me := (p->>'uid')::uuid;
    want := p->>'want';
    got := '';
    RESET ROLE;
    PERFORM set_config('request.jwt.claims',
      CASE WHEN me IS NULL THEN ''
        ELSE jsonb_build_object('sub', me, 'role', 'authenticated')::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', p->>'role');

    BEGIN
      PERFORM 1 FROM public.microsoft_tokens;
      got := got || '-';
    EXCEPTION WHEN insufficient_privilege THEN got := got || 's';
    END;

    BEGIN
      UPDATE public.microsoft_tokens SET access_token = 'x';
      got := got || '-';
    EXCEPTION WHEN insufficient_privilege THEN got := got || 'u';
    END;

    BEGIN
      DELETE FROM public.microsoft_tokens;
      got := got || '-';
    EXCEPTION WHEN insufficient_privilege THEN got := got || 'd';
    END;

    BEGIN
      SELECT coalesce(string_agg(c.microsoft_email || '/' || c.account_type, ','), 'none')
      INTO STRICT want
      FROM public.get_user_microsoft_connection() c;
      got := got || ' ' || want;
    EXCEPTION WHEN insufficient_privilege THEN got := got || ' refused';
    END;
    want := p->>'want';

    RESET ROLE;
    RAISE NOTICE '%: %', p->>'name', got;
    IF got IS DISTINCT FROM want THEN
      failures := failures || format('%s: got %s, want %s', p->>'name', got, want);
    END IF;
  END LOOP;

  RESET ROLE;
  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'microsoft_tokens failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Microsoft tokens: unreadable from the browser, connection check returns own address only, anon refused' AS result;
ROLLBACK;
