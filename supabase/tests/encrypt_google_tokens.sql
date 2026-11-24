-- Google tokens encrypted in Vault (20261124130000_encrypt_google_tokens.sql).
-- Synthetic tenant, user and rows; full rollback. Runs on a scratch database,
-- a Preview branch or Staging.
--
-- - A Google connection's tokens are stored as Vault secrets, not as plain text.
-- - google_integration_tokens decrypts them for the service role only.
-- - A token refresh replaces the secret; deleting the connection deletes it.
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  tenant_id_ uuid;
  owner_id uuid := gen_random_uuid();
  google_id uuid;
  got text;
  n bigint;
  failures text[] := '{}';
BEGIN
  INSERT INTO public.tenants (name, slug) VALUES ('QA vault', 'qa-vault-' || tag)
    RETURNING id INTO tenant_id_;
  INSERT INTO auth.users (id, email) VALUES (owner_id, 'qa-vault-' || tag || '@example.invalid');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES (tenant_id_, owner_id, 'owner');

  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key, settings)
  VALUES (tenant_id_, owner_id, 'google_ads', 'qa-access-' || tag,
    jsonb_build_object('refresh_token', 'qa-refresh-' || tag))
  RETURNING id INTO google_id;

  -- Stored as Vault secrets, whose stored value is not the token.
  SELECT count(*) INTO n FROM vault.secrets
  WHERE name IN (public.google_token_secret_name('access', google_id), public.google_token_secret_name('refresh', google_id))
    AND secret NOT IN ('qa-access-' || tag, 'qa-refresh-' || tag);
  IF n <> 2 THEN
    failures := failures || format('want 2 encrypted secrets, got %s', n);
  END IF;

  -- The service role decrypts them.
  SET LOCAL ROLE service_role;
  SELECT access_token || '/' || refresh_token INTO got
  FROM public.google_integration_tokens(array[google_id]);
  RESET ROLE;
  IF got IS DISTINCT FROM 'qa-access-' || tag || '/qa-refresh-' || tag THEN
    failures := failures || format('service role decrypted %s', coalesce(got, 'nothing'));
  END IF;

  -- No browser role may decrypt.
  FOR got IN SELECT unnest(array['authenticated', 'anon']) LOOP
    PERFORM set_config('request.jwt.claims',
      CASE got WHEN 'authenticated' THEN jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text ELSE '' END, true);
    EXECUTE format('SET LOCAL ROLE %I', got);
    BEGIN
      PERFORM public.google_integration_tokens(array[google_id]);
      failures := failures || format('%s decrypted Google tokens', got);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;

  -- A refresh replaces the access token's secret.
  UPDATE public.tenant_integrations SET api_key = 'qa-access-2-' || tag WHERE id = google_id;
  SELECT access_token INTO got FROM public.google_integration_tokens(array[google_id]);
  IF got IS DISTINCT FROM 'qa-access-2-' || tag THEN
    failures := failures || format('after a refresh: got %s', coalesce(got, 'nothing'));
  END IF;
  SELECT count(*) INTO n FROM vault.secrets WHERE name LIKE '%' || google_id::text;
  IF n <> 2 THEN
    failures := failures || format('a refresh left %s secrets, want 2', n);
  END IF;

  -- Deleting the connection deletes its secrets.
  DELETE FROM public.tenant_integrations WHERE id = google_id;
  SELECT count(*) INTO n FROM vault.secrets WHERE name LIKE '%' || google_id::text;
  IF n <> 0 THEN
    failures := failures || format('%s secrets outlived their connection', n);
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'encrypt_google_tokens failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Google tokens: encrypted in Vault, decrypted for the service role only' AS result;
ROLLBACK;
