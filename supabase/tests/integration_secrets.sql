-- Google tokens in integration_secrets (20261123120000_integration_secrets.sql).
-- Synthetic tenant, users and rows; full rollback. Runs on a scratch database,
-- a Preview branch or Staging.
--
-- - A Google row's api_key and settings.refresh_token are copied into
--   integration_secrets on insert and on every token update, also when the
--   owner makes the change from the browser (the trigger is security definer).
-- - No browser role reads or writes integration_secrets, the owner included.
-- - Other integration types are not copied; deleting a row deletes its secrets.
BEGIN;
DO $test$
DECLARE
  tag text := left(gen_random_uuid()::text, 8);
  tenant_id_ uuid;
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  google_id uuid;
  other_id uuid;
  got text;
  n bigint;
  failures text[] := '{}';
BEGIN
  INSERT INTO public.tenants (name, slug) VALUES ('QA secrets', 'qa-secrets-' || tag)
    RETURNING id INTO tenant_id_;
  INSERT INTO auth.users (id, email) VALUES
    (owner_id, 'qa-secrets-' || tag || '-owner@example.invalid'),
    (member_id, 'qa-secrets-' || tag || '-member@example.invalid');
  INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
    (tenant_id_, owner_id, 'owner'), (tenant_id_, member_id, 'member');

  -- The owner connects Analytics from the browser.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key, settings)
  VALUES (tenant_id_, owner_id, 'google_analytics', 'access-1',
    jsonb_build_object('refresh_token', 'refresh-1', 'google_email', 'qa@example.invalid'))
  RETURNING id INTO google_id;
  RESET ROLE;

  SELECT access_token || '/' || refresh_token INTO got
  FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM 'access-1/refresh-1' THEN
    failures := failures || format('insert copy: got %s, want access-1/refresh-1', coalesce(got, 'no row'));
  END IF;

  -- The owner changes a setting and a token from the browser; neither may fail.
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.tenant_integrations
      SET settings = settings || '{"property_id": "p1"}', api_key = 'access-2'
      WHERE id = google_id;
  EXCEPTION WHEN insufficient_privilege THEN
    failures := failures || 'the owner''s own update failed on integration_secrets';
  END;
  RESET ROLE;

  SELECT access_token || '/' || refresh_token INTO got
  FROM public.integration_secrets WHERE integration_id = google_id;
  IF got IS DISTINCT FROM 'access-2/refresh-1' THEN
    failures := failures || format('update copy: got %s, want access-2/refresh-1', coalesce(got, 'no row'));
  END IF;

  -- No browser role reaches integration_secrets: the owner, another member, anon.
  FOR got IN SELECT unnest(array['owner', 'member', 'anon']) LOOP
    PERFORM set_config('request.jwt.claims',
      CASE got
        WHEN 'owner' THEN jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text
        WHEN 'member' THEN jsonb_build_object('sub', member_id, 'role', 'authenticated')::text
        ELSE '' END, true);
    EXECUTE format('SET LOCAL ROLE %I', CASE got WHEN 'anon' THEN 'anon' ELSE 'authenticated' END);
    BEGIN
      SELECT count(*) INTO n FROM public.integration_secrets;
      failures := failures || format('%s read integration_secrets (%s rows)', got, n);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      UPDATE public.integration_secrets SET refresh_token = 'stolen' WHERE integration_id = google_id;
      failures := failures || format('%s updated integration_secrets', got);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;

  -- Other integration types are not copied, and the trigger's type check does
  -- not stop a member saving one from the browser.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.tenant_integrations (tenant_id, user_id, integration_type, api_key)
    VALUES (tenant_id_, owner_id, 'sumit', 'qa-sumit-key') RETURNING id INTO other_id;
  EXCEPTION WHEN insufficient_privilege THEN
    failures := failures || 'the owner could not save a non-Google integration';
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.integration_secrets WHERE integration_id = other_id;
  IF n <> 0 THEN
    failures := failures || 'a non-Google row was copied';
  END IF;

  -- A row whose type changes to Google gets its secrets row, with no token change.
  UPDATE public.tenant_integrations SET integration_type = 'google_analytics' WHERE id = other_id;
  SELECT access_token INTO got FROM public.integration_secrets WHERE integration_id = other_id;
  IF got IS DISTINCT FROM 'qa-sumit-key' THEN
    failures := failures || format('type change copy: got %s, want qa-sumit-key', coalesce(got, 'no row'));
  END IF;

  -- Deleting the connection deletes its secrets.
  DELETE FROM public.tenant_integrations WHERE id = google_id;
  SELECT count(*) INTO n FROM public.integration_secrets WHERE integration_id = google_id;
  IF n <> 0 THEN
    failures := failures || 'secrets outlived their connection';
  END IF;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION E'integration_secrets failed:\n%', array_to_string(failures, E'\n');
  END IF;
END;
$test$;
SELECT 'Google tokens: copied into integration_secrets, which no browser role reaches' AS result;
ROLLBACK;
