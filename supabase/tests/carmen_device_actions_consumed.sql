-- Carmen device actions, used steps (20261126160000_carmen_device_actions_consumed):
-- consumed_at is a nullable timestamptz that a new row leaves null; a signed-in user
-- cannot read it, even on their own row, and holds no grant on it; the guarded UPDATE
-- run-ai-agent sends uses a step once. Synthetic users and tenants inside one transaction
-- that is rolled back.
BEGIN;

DO $test$
DECLARE
  v_me uuid := gen_random_uuid();
  v_tenant uuid;
  v_step uuid;
  v_type text;
  v_nullable text;
  v_used integer;
  v_names text[];
BEGIN
  SELECT data_type, is_nullable INTO v_type, v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'carmen_device_actions'
    AND column_name = 'consumed_at';
  IF v_type IS DISTINCT FROM 'timestamp with time zone' OR v_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'column: consumed_at must be a nullable timestamptz, found % %', v_type, v_nullable;
  END IF;

  INSERT INTO auth.users (id, email)
  VALUES (v_me, 'qa-device-consumed-' || v_me || '@example.invalid');
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA device consumed', 'qa-device-consumed-' || replace(v_me::text, '-', ''))
  RETURNING id INTO v_tenant;
  INSERT INTO public.carmen_device_actions (tenant_id, user_id, run_id, tool, status, result, expires_at)
  VALUES (v_tenant, v_me, gen_random_uuid(), 'browser_read_page', 'done', '{"text": "page"}', now())
  RETURNING id INTO v_step;

  IF (SELECT consumed_at FROM public.carmen_device_actions WHERE id = v_step) IS NOT NULL THEN
    RAISE EXCEPTION 'default: a new step must not be used';
  END IF;

  -- The guarded UPDATE run-ai-agent sends: the first uses the step and clears its page text,
  -- the second finds nothing.
  UPDATE public.carmen_device_actions
  SET consumed_at = now(), result = NULL
  WHERE id = v_step AND tenant_id = v_tenant AND user_id = v_me
    AND status = 'done' AND consumed_at IS NULL;
  GET DIAGNOSTICS v_used = ROW_COUNT;
  IF v_used <> 1 OR (SELECT result FROM public.carmen_device_actions WHERE id = v_step) IS NOT NULL THEN
    RAISE EXCEPTION 'use: the first guarded update must use the step and clear its result';
  END IF;
  UPDATE public.carmen_device_actions
  SET consumed_at = now(), result = NULL
  WHERE id = v_step AND tenant_id = v_tenant AND user_id = v_me
    AND status = 'done' AND consumed_at IS NULL;
  GET DIAGNOSTICS v_used = ROW_COUNT;
  IF v_used <> 0 THEN
    RAISE EXCEPTION 'use: a step must be used once';
  END IF;

  -- Signed in, the owner of the row still cannot read the column.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM consumed_at FROM public.carmen_device_actions WHERE id = v_step;
    RAISE EXCEPTION 'grants: a signed-in user must not read consumed_at';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  SELECT array_agg(coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type) INTO v_names
  FROM pg_attribute att
  CROSS JOIN LATERAL aclexplode(att.attacl) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE att.attrelid = 'public.carmen_device_actions'::regclass
    AND att.attname = 'consumed_at'
    AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'));
  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION 'grants: unexpected grants on consumed_at: %', v_names;
  END IF;
END
$test$;

ROLLBACK;
