-- Which clients a tenant may read through Carmen
-- (20261119230000_tenant_client_read_scope): its own, and those of the agencies
-- shared with it, re-shares included, and nothing once the share is revoked.
-- Staging only: the test's own tenants, agencies, clients and shares, and a
-- full rollback.
BEGIN;
DO $test$
DECLARE
  t_s uuid; t_b uuid; t_c uuid; t_d uuid;
  a_x uuid; a_y uuid;
  c_x uuid; c_y uuid;
BEGIN
  -- t_s owns agencies X and Y and a client in each.
  -- It shares only X with t_b, which re-shares X with t_c. t_d gets nothing.
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK S', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_s;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK B', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_b;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK C', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_c;
  INSERT INTO public.tenants (name, slug)
  VALUES ('QA ROLLBACK D', 'qa-rollback-' || gen_random_uuid()) RETURNING id INTO t_d;

  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK X', t_s) RETURNING id INTO a_x;
  INSERT INTO public.agencies (name, tenant_id) VALUES ('QA ROLLBACK Y', t_s) RETURNING id INTO a_y;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES ('QA ROLLBACK X client', t_s, a_x) RETURNING id INTO c_x;
  INSERT INTO public.clients (name, tenant_id, agency_id)
  VALUES ('QA ROLLBACK Y client', t_s, a_y) RETURNING id INTO c_y;

  INSERT INTO public.agency_tenant_access (source_tenant_id, agency_id, accessing_tenant_id, access_level)
  VALUES (t_s, a_x, t_b, 'read_only'),
         (t_b, a_x, t_c, 'read_only');

  -- Only the service role may call either function.
  IF has_function_privilege('authenticated', 'public.tenant_can_read_client(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tenant_can_read_client(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tenant_shared_agency_ids(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tenant_shared_agency_ids(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A browser role can call the tenant client read scope';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.tenant_can_read_client(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.tenant_shared_agency_ids(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The service role cannot call the tenant client read scope';
  END IF;

  -- The own tenant reads all its clients.
  IF NOT (public.tenant_can_read_client(t_s, c_x)
          AND public.tenant_can_read_client(t_s, c_y)) THEN
    RAISE EXCEPTION 'The own tenant cannot read its clients';
  END IF;

  -- The share and the re-share open X's client, never Y's.
  IF NOT public.tenant_can_read_client(t_b, c_x) THEN
    RAISE EXCEPTION 'A shared agency''s client is not readable';
  END IF;
  IF NOT public.tenant_can_read_client(t_c, c_x) THEN
    RAISE EXCEPTION 'A re-shared agency''s client is not readable';
  END IF;
  IF public.tenant_can_read_client(t_b, c_y) OR public.tenant_can_read_client(t_c, c_y) THEN
    RAISE EXCEPTION 'A share of one agency opens the source tenant''s other agency';
  END IF;
  IF public.tenant_can_read_client(t_d, c_x) OR public.tenant_can_read_client(NULL, c_x) THEN
    RAISE EXCEPTION 'A tenant with no share reads the client';
  END IF;

  IF public.tenant_shared_agency_ids(t_b) <> ARRAY[a_x]
     OR public.tenant_shared_agency_ids(t_c) <> ARRAY[a_x] THEN
    RAISE EXCEPTION 'The shared agencies are not exactly X';
  END IF;
  IF public.tenant_shared_agency_ids(t_s) <> ARRAY[]::uuid[]
     OR public.tenant_shared_agency_ids(t_d) <> ARRAY[]::uuid[] THEN
    RAISE EXCEPTION 'A tenant with no share has shared agencies';
  END IF;

  -- Revoking the share ends the re-share too (agency_tenant_access_revoke_downstream).
  DELETE FROM public.agency_tenant_access
  WHERE source_tenant_id = t_s AND agency_id = a_x AND accessing_tenant_id = t_b;
  IF public.tenant_can_read_client(t_b, c_x) OR public.tenant_can_read_client(t_c, c_x) THEN
    RAISE EXCEPTION 'A revoked share still reads the client';
  END IF;
  IF public.tenant_shared_agency_ids(t_b) <> ARRAY[]::uuid[]
     OR public.tenant_shared_agency_ids(t_c) <> ARRAY[]::uuid[] THEN
    RAISE EXCEPTION 'A revoked share still lists the agency';
  END IF;
  IF NOT public.tenant_can_read_client(t_s, c_x) THEN
    RAISE EXCEPTION 'Revoking a share hides the client from its own tenant';
  END IF;
END;
$test$;
SELECT 'Tenant client read scope passed' AS result;
ROLLBACK;
