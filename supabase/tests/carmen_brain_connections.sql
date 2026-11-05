-- Carmen brain connection keys (20261023100000_carmen_brain_connections):
-- synthetic connection inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_conn uuid;
  v_secret uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Requires a tenant'; END IF;
  INSERT INTO public.carmen_brain_connections (tenant_id, slug, name, kind)
  VALUES (v_tenant, 'qa-rollback-brain', 'QA ROLLBACK', 'chat_model')
  RETURNING id INTO v_conn;

  -- Set, then rotate: one Vault row, last 4 follows the newest key.
  PERFORM public.carmen_brain_secret_set(v_conn, 'sk-qa-first-1111');
  SELECT secret_id INTO v_secret FROM public.carmen_brain_connections WHERE id = v_conn;
  PERFORM public.carmen_brain_secret_set(v_conn, 'sk-qa-second-2222');
  IF public.carmen_brain_secret_get(v_conn) <> 'sk-qa-second-2222' THEN
    RAISE EXCEPTION 'rotate: get must return the newest key';
  END IF;
  IF (SELECT key_last4 FROM public.carmen_brain_connections WHERE id = v_conn) <> '2222'
     OR (SELECT secret_id FROM public.carmen_brain_connections WHERE id = v_conn) <> v_secret THEN
    RAISE EXCEPTION 'rotate: must update the same Vault row and last 4';
  END IF;

  -- Browsers may not read secret_id, call the key functions, or write rows.
  IF has_column_privilege('authenticated', 'public.carmen_brain_connections', 'secret_id', 'SELECT')
     OR has_function_privilege('authenticated', 'public.carmen_brain_secret_get(uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.carmen_brain_connections', 'INSERT')
     OR has_table_privilege('authenticated', 'public.carmen_brain_connections', 'UPDATE') THEN
    RAISE EXCEPTION 'grants: members must not reach keys or write connections';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.carmen_brain_connections', 'key_last4', 'SELECT') THEN
    RAISE EXCEPTION 'grants: members must see key_last4';
  END IF;

  -- Deleting the connection deletes its Vault key.
  DELETE FROM public.carmen_brain_connections WHERE id = v_conn;
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secret) THEN
    RAISE EXCEPTION 'delete: Vault key must be removed with the connection';
  END IF;
END
$test$;
ROLLBACK;
