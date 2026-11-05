-- Duplicate dev-task dispatch guard (20261103114000_claude_dev_dispatch_guard):
-- synthetic dispatches inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_first record;
  v_again record;
BEGIN
  -- The first call reserves a row; the same task (other case and spacing)
  -- inside the window gets that row back with its session link.
  SELECT * INTO v_first
  FROM public.claim_claude_dev_dispatch(v_tenant, 'Fix the  login bug', '', '', 900, NULL);
  IF NOT v_first.claimed THEN
    RAISE EXCEPTION 'claim: the first call must reserve';
  END IF;
  UPDATE public.claude_dispatches
  SET status = 'dispatched', session_url = 'https://claude.ai/code/s1'
  WHERE id = v_first.dispatch_id;

  SELECT * INTO v_again
  FROM public.claim_claude_dev_dispatch(v_tenant, '  fix the login BUG ', 'ctx', 'develop', 900, NULL);
  IF v_again.claimed OR v_again.dispatch_id <> v_first.dispatch_id
     OR v_again.existing_session_url IS DISTINCT FROM 'https://claude.ai/code/s1' THEN
    RAISE EXCEPTION 'duplicate: a repeat inside the window must return the first session';
  END IF;

  -- Another tenant with the same task reserves its own row.
  SELECT * INTO v_again
  FROM public.claim_claude_dev_dispatch(v_other, 'Fix the login bug', '', '', 900, NULL);
  IF NOT v_again.claimed THEN
    RAISE EXCEPTION 'tenant: another tenant must reserve its own dispatch';
  END IF;

  -- A different task reserves.
  SELECT * INTO v_again
  FROM public.claim_claude_dev_dispatch(v_tenant, 'Fix the logout bug', '', '', 900, NULL);
  IF NOT v_again.claimed THEN
    RAISE EXCEPTION 'hash: a different task must reserve';
  END IF;

  -- After the window the same task reserves again.
  UPDATE public.claude_dispatches
  SET created_at = now() - interval '16 minutes'
  WHERE tenant_id = v_tenant AND request_hash IS NOT NULL;
  SELECT * INTO v_again
  FROM public.claim_claude_dev_dispatch(v_tenant, 'Fix the login bug', '', '', 900, NULL);
  IF NOT v_again.claimed THEN
    RAISE EXCEPTION 'window: a repeat after the window must reserve';
  END IF;

  -- A failed fire does not block a retry.
  UPDATE public.claude_dispatches SET status = 'failed' WHERE id = v_again.dispatch_id;
  SELECT * INTO v_again
  FROM public.claim_claude_dev_dispatch(v_tenant, 'Fix the login bug', '', '', 900, NULL);
  IF NOT v_again.claimed THEN
    RAISE EXCEPTION 'failed: a retry after a failed fire must reserve';
  END IF;

  -- Browsers may not reserve dispatches.
  IF has_function_privilege('anon', 'public.claim_claude_dev_dispatch(uuid,text,text,text,integer,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_claude_dev_dispatch(uuid,text,text,text,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: only the service role may reserve';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_claude_dev_dispatch(uuid,text,text,text,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: the service role must be able to reserve';
  END IF;
END
$test$;
ROLLBACK;
